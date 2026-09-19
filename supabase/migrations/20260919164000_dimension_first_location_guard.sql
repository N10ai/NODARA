-- Dimension-first physical occupancy for warehouse locations.
-- The stored cargo object (top-level or independently located child) consumes space once,
-- regardless of the business quantity contained inside it.

create or replace function public.nodara_guard_location_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loc public.warehouse_locations%rowtype;
  incoming_volume numeric;
  occupied_volume numeric := 0;
  cargo_volume numeric;
  fits boolean := false;
begin
  if new.warehouse_location_id is null then return new; end if;

  select * into loc
  from public.warehouse_locations
  where id=new.warehouse_location_id and active=true;
  if not found then raise exception 'Storage location is inactive or does not exist.'; end if;

  -- A nested object only consumes independent location space when explicitly located
  -- somewhere different from its parent. Normal contained cargo inherits its HU location.
  if new.parent_id is not null and not exists (
    select 1 from public.cargo_units p
    where p.id=new.parent_id
      and p.warehouse_location_id is distinct from new.warehouse_location_id
  ) then return new; end if;

  -- Without configured dimensions we cannot truthfully prove spatial capacity.
  -- Do not fall back to business quantity or the legacy "capacity = pieces" interpretation.
  if coalesce(loc.length_in,0)<=0 or coalesce(loc.width_in,0)<=0 or coalesce(loc.height_in,0)<=0
     or coalesce(new.length_in,0)<=0 or coalesce(new.width_in,0)<=0 or coalesce(new.height_in,0)<=0 then
    return new;
  end if;

  -- The object must fit through the location envelope in at least one 90-degree orientation.
  fits :=
    (new.length_in<=loc.length_in and new.width_in<=loc.width_in and new.height_in<=loc.height_in) or
    (new.length_in<=loc.length_in and new.height_in<=loc.width_in and new.width_in<=loc.height_in) or
    (new.width_in<=loc.length_in and new.length_in<=loc.width_in and new.height_in<=loc.height_in) or
    (new.width_in<=loc.length_in and new.height_in<=loc.width_in and new.length_in<=loc.height_in) or
    (new.height_in<=loc.length_in and new.length_in<=loc.width_in and new.width_in<=loc.height_in) or
    (new.height_in<=loc.length_in and new.width_in<=loc.width_in and new.length_in<=loc.height_in);
  if not fits then
    raise exception 'Cargo dimensions % x % x % in do not fit location % (% x % x % in).',
      new.length_in,new.width_in,new.height_in,loc.code,loc.length_in,loc.width_in,loc.height_in;
  end if;

  incoming_volume := new.length_in*new.width_in*new.height_in;

  select coalesce(sum(c.length_in*c.width_in*c.height_in),0)
  into occupied_volume
  from public.cargo_units c
  where c.warehouse_location_id=new.warehouse_location_id
    and c.id is distinct from new.id
    and upper(coalesce(c.status,'')) not in ('RELEASED','DELETED','CANCELLED','VOID','SHIPPED')
    and coalesce(c.length_in,0)>0 and coalesce(c.width_in,0)>0 and coalesce(c.height_in,0)>0
    and (
      c.parent_id is null or not exists (
        select 1 from public.cargo_units p
        where p.id=c.parent_id and p.warehouse_location_id is not distinct from c.warehouse_location_id
      )
    );

  if occupied_volume + incoming_volume > loc.length_in*loc.width_in*loc.height_in then
    raise exception 'Cargo does not fit in location %. Dimensional space is already approximately % percent occupied.',
      loc.code,round((occupied_volume/(loc.length_in*loc.width_in*loc.height_in)*100)::numeric,1);
  end if;

  return new;
end;
$$;

comment on function public.nodara_guard_location_capacity() is
'Dimension-first location guard. Cargo quantity is inventory content, not storage-position consumption. Uses object envelope fit plus occupied dimensional volume; exact 3D packing remains advisory.';

notify pgrst, 'reload schema';
