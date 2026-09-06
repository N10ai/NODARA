-- ============================================================
-- NODARA LOCATION DIMENSIONAL CAPACITY
-- ============================================================

alter table public.warehouse_locations
  add column if not exists length_in numeric(12,3),
  add column if not exists width_in numeric(12,3),
  add column if not exists height_in numeric(12,3);

comment on column public.warehouse_locations.length_in is 'Usable internal storage length in inches.';
comment on column public.warehouse_locations.width_in is 'Usable internal storage width in inches.';
comment on column public.warehouse_locations.height_in is 'Usable internal storage height in inches.';

-- Returns the maximum axis-aligned count of a cargo object that can fit
-- inside a dimensional location, allowing 90-degree rotation.
create or replace function public.nodara_dimensional_fit_count(
  p_location_id uuid,
  p_length_in numeric,
  p_width_in numeric,
  p_height_in numeric
)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  l numeric; w numeric; h numeric;
  a integer := 0;
  v integer;
begin
  if coalesce(p_length_in,0) <= 0 or coalesce(p_width_in,0) <= 0 or coalesce(p_height_in,0) <= 0 then
    return null;
  end if;

  select length_in,width_in,height_in into l,w,h
  from public.warehouse_locations
  where id=p_location_id;

  if coalesce(l,0)<=0 or coalesce(w,0)<=0 or coalesce(h,0)<=0 then
    return null;
  end if;

  v := floor(l/p_length_in)::int * floor(w/p_width_in)::int * floor(h/p_height_in)::int; a := greatest(a,v);
  v := floor(l/p_length_in)::int * floor(w/p_height_in)::int * floor(h/p_width_in)::int; a := greatest(a,v);
  v := floor(l/p_width_in)::int * floor(w/p_length_in)::int * floor(h/p_height_in)::int; a := greatest(a,v);
  v := floor(l/p_width_in)::int * floor(w/p_height_in)::int * floor(h/p_length_in)::int; a := greatest(a,v);
  v := floor(l/p_height_in)::int * floor(w/p_length_in)::int * floor(h/p_width_in)::int; a := greatest(a,v);
  v := floor(l/p_height_in)::int * floor(w/p_width_in)::int * floor(h/p_length_in)::int; a := greatest(a,v);
  return a;
end;
$$;

-- Hard guard for top-level cargo placement.
-- Nested cargo inherits the root handling unit's location and does not consume
-- another storage position.
create or replace function public.nodara_guard_location_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  loc public.warehouse_locations%rowtype;
  used_positions numeric := 0;
  incoming_qty numeric := greatest(1,coalesce(nullif(j->>'quantity','')::numeric,1));
  pkg text := upper(coalesce(j->>'package_type',''));
  fit_count integer;
  used_loose numeric := 0;
begin
  if new.warehouse_location_id is null then return new; end if;

  -- Child cargo lives with the parent handling unit and does not consume a slot.
  if nullif(j->>'parent_id','') is not null then return new; end if;

  select * into loc from public.warehouse_locations where id=new.warehouse_location_id and active=true;
  if not found then raise exception 'Storage location is inactive or does not exist.'; end if;

  select coalesce(sum(greatest(1,coalesce(c.quantity,1))),0)
    into used_positions
  from public.cargo_units c
  where c.warehouse_location_id=new.warehouse_location_id
    and c.parent_id is null
    and c.id is distinct from new.id
    and upper(coalesce(c.status,'')) not in ('RELEASED','DELETED','CANCELLED','VOID','SHIPPED');

  if pkg in ('PALLET','SKID','CRATE') then
    if coalesce(loc.capacity,0) > 0 and used_positions + incoming_qty > loc.capacity then
      raise exception 'Location % is full. Capacity: %, currently used: %, requested: %.',loc.code,loc.capacity,used_positions,incoming_qty;
    end if;
    return new;
  end if;

  fit_count := public.nodara_dimensional_fit_count(
    new.warehouse_location_id,
    nullif(j->>'length_in','')::numeric,
    nullif(j->>'width_in','')::numeric,
    nullif(j->>'height_in','')::numeric
  );

  if fit_count is not null then
    used_loose := used_positions;
    if used_loose + incoming_qty > fit_count then
      raise exception 'Cargo does not fit in location %. Dimensional capacity is approximately %, currently used %, requested %.',loc.code,fit_count,used_loose,incoming_qty;
    end if;
  elsif coalesce(loc.capacity,0) > 0 and used_positions + incoming_qty > loc.capacity then
    raise exception 'Location % is full. Capacity: %, currently used: %, requested: %.',loc.code,loc.capacity,used_positions,incoming_qty;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nodara_guard_location_capacity on public.cargo_units;
create trigger trg_nodara_guard_location_capacity
before insert or update of warehouse_location_id, quantity, length_in, width_in, height_in, package_type
on public.cargo_units
for each row
execute function public.nodara_guard_location_capacity();

notify pgrst, 'reload schema';
