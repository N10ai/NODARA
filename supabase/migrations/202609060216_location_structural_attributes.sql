alter table warehouse_locations add column if not exists rack_code text;
alter table warehouse_locations add column if not exists bay_code text;
alter table warehouse_locations add column if not exists level_code text;
alter table warehouse_locations add column if not exists position_code text;
create index if not exists idx_warehouse_locations_structure on warehouse_locations(organization_id, facility, zone, rack_code, bay_code, level_code, position_code);
