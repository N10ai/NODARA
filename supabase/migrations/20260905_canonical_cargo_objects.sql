-- NODARA canonical cargo architecture
-- Cargo Object = physical freight identity
-- Cargo Assignment = transaction planning/reference
-- Cargo Event = physical/operational lineage

create table if not exists public.cargo_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cargo_code text,
  source_type text not null default 'DIRECT',
  source_id uuid,
  parent_cargo_id uuid references public.cargo_objects(id) on delete set null,
  owner_entity_id uuid references public.entities(id) on delete set null,
  package_type text,
  quantity numeric(14,4) not null default 1,
  uom text,
  description text,
  gross_weight numeric(14,4),
  weight_unit text,
  length numeric(14,4),
  width numeric(14,4),
  height numeric(14,4),
  dimension_unit text,
  volume_cbm numeric(14,6),
  warehouse_location_id uuid,
  status text not null default 'AVAILABLE',
  identity_status text not null default 'KNOWN',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cargo_objects_org_code_uidx
  on public.cargo_objects(organization_id,cargo_code)
  where cargo_code is not null;
create index if not exists cargo_objects_source_idx on public.cargo_objects(organization_id,source_type,source_id);
create index if not exists cargo_objects_parent_idx on public.cargo_objects(parent_cargo_id);
create index if not exists cargo_objects_status_idx on public.cargo_objects(organization_id,status);

create table if not exists public.cargo_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cargo_object_id uuid not null references public.cargo_objects(id) on delete cascade,
  transaction_type text not null,
  transaction_id uuid not null,
  assignment_role text not null default 'CARGO',
  planned_quantity numeric(14,4),
  status text not null default 'ASSIGNED',
  sequence_no integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cargo_object_id,transaction_type,transaction_id,assignment_role)
);
create index if not exists cargo_assignments_tx_idx on public.cargo_assignments(organization_id,transaction_type,transaction_id,sequence_no);
create index if not exists cargo_assignments_cargo_idx on public.cargo_assignments(cargo_object_id,status);

create table if not exists public.cargo_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cargo_object_id uuid not null references public.cargo_objects(id) on delete cascade,
  event_type text not null,
  transaction_type text,
  transaction_id uuid,
  from_cargo_id uuid references public.cargo_objects(id) on delete set null,
  to_cargo_id uuid references public.cargo_objects(id) on delete set null,
  quantity numeric(14,4),
  event_at timestamptz not null default now(),
  performed_by uuid,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cargo_events_cargo_idx on public.cargo_events(organization_id,cargo_object_id,event_at desc);
create index if not exists cargo_events_tx_idx on public.cargo_events(organization_id,transaction_type,transaction_id,event_at desc);

-- Bridge the existing WR cargo implementation to canonical cargo objects.
alter table public.cargo_units add column if not exists cargo_object_id uuid references public.cargo_objects(id) on delete set null;
create unique index if not exists cargo_units_cargo_object_uidx on public.cargo_units(cargo_object_id) where cargo_object_id is not null;

-- Dynamic backfill: to_jsonb makes this tolerant of legacy cargo_units column differences.
insert into public.cargo_objects(
  id,organization_id,cargo_code,source_type,source_id,parent_cargo_id,package_type,quantity,uom,description,
  gross_weight,weight_unit,length,width,height,dimension_unit,volume_cbm,status,metadata
)
select
  c.id,
  c.organization_id,
  coalesce(to_jsonb(c)->>'uin',to_jsonb(c)->>'cargo_code',to_jsonb(c)->>'handling_unit_id'),
  'WAREHOUSE_RECEIPT',
  nullif(coalesce(to_jsonb(c)->>'warehouse_receipt_id',to_jsonb(c)->>'receipt_id'),'')::uuid,
  nullif(coalesce(to_jsonb(c)->>'parent_id',to_jsonb(c)->>'parent_cargo_id'),'')::uuid,
  coalesce(to_jsonb(c)->>'package_type',to_jsonb(c)->>'type'),
  coalesce(nullif(to_jsonb(c)->>'quantity','')::numeric,1),
  coalesce(to_jsonb(c)->>'uom',to_jsonb(c)->>'unit'),
  coalesce(to_jsonb(c)->>'description',to_jsonb(c)->>'commodity'),
  nullif(coalesce(to_jsonb(c)->>'gross_weight',to_jsonb(c)->>'weight'),'')::numeric,
  coalesce(to_jsonb(c)->>'weight_unit','LB'),
  nullif(to_jsonb(c)->>'length','')::numeric,
  nullif(to_jsonb(c)->>'width','')::numeric,
  nullif(to_jsonb(c)->>'height','')::numeric,
  coalesce(to_jsonb(c)->>'dimension_unit','IN'),
  nullif(to_jsonb(c)->>'volume_cbm','')::numeric,
  coalesce(to_jsonb(c)->>'status','AVAILABLE'),
  jsonb_build_object('legacy_cargo_unit_id',c.id)
from public.cargo_units c
on conflict(id) do nothing;

update public.cargo_units set cargo_object_id=id where cargo_object_id is null;

-- Every WR owns/contains the cargo born from it.
insert into public.cargo_assignments(organization_id,cargo_object_id,transaction_type,transaction_id,assignment_role,status)
select organization_id,id,'WAREHOUSE_RECEIPT',source_id,'SOURCE','ASSIGNED'
from public.cargo_objects
where source_type='WAREHOUSE_RECEIPT' and source_id is not null
on conflict do nothing;

-- Initial lineage event for existing cargo.
insert into public.cargo_events(organization_id,cargo_object_id,event_type,transaction_type,transaction_id,metadata)
select organization_id,id,'RECEIVED','WAREHOUSE_RECEIPT',source_id,'{"backfilled":true}'::jsonb
from public.cargo_objects
where source_type='WAREHOUSE_RECEIPT' and source_id is not null
and not exists(select 1 from public.cargo_events e where e.cargo_object_id=cargo_objects.id and e.event_type='RECEIVED');

alter table public.cargo_objects enable row level security;
alter table public.cargo_assignments enable row level security;
alter table public.cargo_events enable row level security;

drop policy if exists cargo_objects_org_access on public.cargo_objects;
create policy cargo_objects_org_access on public.cargo_objects for all to authenticated
using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists cargo_assignments_org_access on public.cargo_assignments;
create policy cargo_assignments_org_access on public.cargo_assignments for all to authenticated
using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists cargo_events_org_access on public.cargo_events;
create policy cargo_events_org_access on public.cargo_events for all to authenticated
using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

grant select,insert,update,delete on public.cargo_objects,public.cargo_assignments,public.cargo_events to authenticated;
notify pgrst,'reload schema';