alter table warehouse_locations add column if not exists space_class text not null default 'STORAGE';
alter table warehouse_locations add column if not exists operational_purpose text;
alter table warehouse_locations add column if not exists area_sqft numeric;
alter table warehouse_locations add column if not exists pallet_equivalent_capacity numeric;
alter table warehouse_locations add column if not exists x_coord numeric;
alter table warehouse_locations add column if not exists y_coord numeric;
alter table warehouse_locations add column if not exists map_width numeric;
alter table warehouse_locations add column if not exists map_height numeric;
alter table warehouse_locations add column if not exists aisle_sequence integer;
alter table warehouse_locations add column if not exists travel_priority integer default 100;
alter table warehouse_locations add column if not exists equipment_required text[] not null default '{}';
alter table warehouse_locations add column if not exists max_weight_kg numeric;
alter table warehouse_locations add column if not exists pick_accessible boolean not null default true;
alter table warehouse_locations add column if not exists putaway_enabled boolean not null default true;
alter table warehouse_locations add column if not exists picking_enabled boolean not null default true;
alter table warehouse_locations add column if not exists reserve_storage boolean not null default false;
alter table warehouse_locations add column if not exists forward_pick boolean not null default false;

create table if not exists warehouse_space_allocations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 location_id uuid not null references warehouse_locations(id) on delete cascade,
 transaction_type text,
 transaction_id uuid,
 handling_unit_id uuid,
 allocation_type text not null default 'OCCUPANCY',
 pallet_equivalents numeric not null default 0,
 footprint_sqft numeric not null default 0,
 status text not null default 'ACTIVE',
 starts_at timestamptz not null default now(),
 ends_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_space_alloc_location on warehouse_space_allocations(location_id,status);
create index if not exists idx_space_alloc_transaction on warehouse_space_allocations(transaction_type,transaction_id);

create or replace view warehouse_space_utilization as
select l.id,l.organization_id,l.code,l.name,l.type,l.space_class,l.operational_purpose,l.zone,l.facility,l.area_sqft,l.pallet_equivalent_capacity,l.x_coord,l.y_coord,l.map_width,l.map_height,
 coalesce(sum(a.footprint_sqft) filter(where a.status='ACTIVE'),0) occupied_sqft,
 coalesce(sum(a.pallet_equivalents) filter(where a.status='ACTIVE'),0) occupied_pallet_equivalents,
 case when coalesce(l.area_sqft,0)>0 then round((coalesce(sum(a.footprint_sqft) filter(where a.status='ACTIVE'),0)/l.area_sqft*100)::numeric,1) end sqft_utilization_pct,
 case when coalesce(l.pallet_equivalent_capacity,0)>0 then round((coalesce(sum(a.pallet_equivalents) filter(where a.status='ACTIVE'),0)/l.pallet_equivalent_capacity*100)::numeric,1) end pallet_utilization_pct
from warehouse_locations l left join warehouse_space_allocations a on a.location_id=l.id
group by l.id;
