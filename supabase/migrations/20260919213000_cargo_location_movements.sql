-- Canonical warehouse location movement layer.
-- cargo_units.warehouse_location_id remains the current-state projection for compatibility.
create table if not exists public.cargo_location_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cargo_unit_id uuid not null references public.cargo_units(id) on delete cascade,
  from_location_id uuid references public.warehouse_locations(id),
  to_location_id uuid references public.warehouse_locations(id),
  movement_type text not null default 'PUTAWAY' check (movement_type in ('RECEIVE','PUTAWAY','MOVE','PICK','STAGE','RELEASE','ADJUST')),
  quantity numeric,
  reference_type text,
  reference_id uuid,
  notes text,
  moved_at timestamptz not null default now(),
  moved_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_location_id is distinct from to_location_id)
);
create index if not exists cargo_location_movements_cargo_idx on public.cargo_location_movements(cargo_unit_id,moved_at desc);
create index if not exists cargo_location_movements_org_idx on public.cargo_location_movements(organization_id,moved_at desc);

alter table public.cargo_location_movements enable row level security;
drop policy if exists cargo_location_movements_org_access on public.cargo_location_movements;
create policy cargo_location_movements_org_access on public.cargo_location_movements
for all using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()))
with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));

create or replace function public.move_cargo_location_atomic(
  p_cargo_unit_id uuid,
  p_to_location_id uuid,
  p_movement_type text default 'PUTAWAY',
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null
) returns uuid language plpgsql security invoker as $$
declare
  v_org uuid; v_from uuid; v_qty numeric; v_id uuid;
begin
  select organization_id, warehouse_location_id, quantity
    into v_org, v_from, v_qty
  from public.cargo_units where id=p_cargo_unit_id for update;
  if not found then raise exception 'Cargo unit not found'; end if;
  if p_to_location_id is not null and not exists(
    select 1 from public.warehouse_locations
    where id=p_to_location_id and organization_id=v_org and active=true
  ) then raise exception 'Location is not active or belongs to another organization'; end if;
  if v_from is not distinct from p_to_location_id then return null; end if;
  insert into public.cargo_location_movements(
    organization_id,cargo_unit_id,from_location_id,to_location_id,movement_type,
    quantity,reference_type,reference_id,notes
  ) values(
    v_org,p_cargo_unit_id,v_from,p_to_location_id,upper(coalesce(p_movement_type,'MOVE')),
    v_qty,p_reference_type,p_reference_id,p_notes
  ) returning id into v_id;
  update public.cargo_units set warehouse_location_id=p_to_location_id where id=p_cargo_unit_id;
  return v_id;
end $$;

grant execute on function public.move_cargo_location_atomic(uuid,uuid,text,text,uuid,text) to authenticated;
