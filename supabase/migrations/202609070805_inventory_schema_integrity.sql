-- Scope legacy inventory uniqueness to legacy rows only, so canonical warehouse-location
-- balances can hold the same item/lot in multiple warehouse locations.
alter table public.inventory_balances
  drop constraint if exists inventory_balances_organization_id_inventory_item_id_locati_key;
drop index if exists public.inventory_balances_organization_id_inventory_item_id_locati_key;

create unique index if not exists inventory_balances_legacy_location_key
  on public.inventory_balances(organization_id,inventory_item_id,location_id,lot_number) nulls not distinct
  where warehouse_location_id is null;

create unique index if not exists inventory_balances_org_item_whloc_lot_key
  on public.inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number) nulls not distinct;

-- Inventory transaction history belongs to the cargo record it describes. When a WR/cargo
-- subtree is intentionally deleted, its dependent inventory action history must not block it.
alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_cargo_unit_id_fkey;
alter table public.inventory_transactions
  add constraint inventory_transactions_cargo_unit_id_fkey
  foreign key (cargo_unit_id) references public.cargo_units(id) on delete cascade;
