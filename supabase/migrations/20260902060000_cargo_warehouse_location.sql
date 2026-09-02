alter table public.cargo_units
  add column if not exists warehouse_location_id uuid references public.warehouse_locations(id) on delete set null;

create index if not exists cargo_units_warehouse_location_idx
  on public.cargo_units(warehouse_location_id)
  where warehouse_location_id is not null;
