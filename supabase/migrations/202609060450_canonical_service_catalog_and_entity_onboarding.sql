-- Canonical service catalog coverage for forwarding and transport.
insert into public.service_catalog
  (organization_id,code,name,domain,description,default_unit,active,operational_defaults,metadata)
select o.id,v.code,v.name,v.domain,v.description,v.default_unit,true,v.defaults,jsonb_build_object('source','NODARA_STANDARD')
from public.organizations o
cross join (values
 ('AIR_EXPORT','Air Export','AIR','Air freight export forwarding service.','SHIPMENT',jsonb_build_object('mode','AIR','direction','EXPORT','transaction_stage','EXPORT')),
 ('AIR_IMPORT','Air Import','AIR','Air freight import forwarding service.','SHIPMENT',jsonb_build_object('mode','AIR','direction','IMPORT','transaction_stage','IMPORT')),
 ('OCEAN_EXPORT','Ocean Export','OCEAN','Ocean freight export forwarding service.','SHIPMENT',jsonb_build_object('mode','OCEAN','direction','EXPORT','transaction_stage','EXPORT')),
 ('OCEAN_IMPORT','Ocean Import','OCEAN','Ocean freight import forwarding service.','SHIPMENT',jsonb_build_object('mode','OCEAN','direction','IMPORT','transaction_stage','IMPORT')),
 ('GROUND_PICKUP','Pickup','GROUND','Local or regional cargo pickup.','ORDER',jsonb_build_object('mode','GROUND','direction','INBOUND','transaction_stage','PICKUP')),
 ('GROUND_DELIVERY','Delivery','GROUND','Local or regional cargo delivery.','ORDER',jsonb_build_object('mode','GROUND','direction','OUTBOUND','transaction_stage','DELIVERY')),
 ('GROUND_TRANSFER','Transfer','GROUND','Warehouse, airport, CFS or facility transfer.','ORDER',jsonb_build_object('mode','GROUND','direction','TRANSFER','transaction_stage','TRANSFER')),
 ('DRAYAGE','Drayage','GROUND','Port/rail container drayage.','ORDER',jsonb_build_object('mode','GROUND','transaction_stage','DRAYAGE')),
 ('GROUND_LINEHAUL','Ground Linehaul','GROUND','FTL/LTL or other ground forwarding shipment.','SHIPMENT',jsonb_build_object('mode','GROUND','transaction_stage','LINEHAUL'))
) as v(code,name,domain,description,default_unit,defaults)
where not exists(select 1 from public.service_catalog s where s.organization_id=o.id and s.code=v.code);

alter table public.documents add column if not exists entity_id uuid references public.entities(id) on delete cascade;
create index if not exists documents_entity_id_idx on public.documents(entity_id) where entity_id is not null;

create table if not exists public.entity_onboarding_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  status text not null default 'NOT_STARTED' check(status in ('NOT_STARTED','IN_PROGRESS','READY','ACTIVE','ON_HOLD')),
  owner_note text,
  activated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,entity_id)
);

create table if not exists public.entity_onboarding_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  onboarding_profile_id uuid not null references public.entity_onboarding_profiles(id) on delete cascade,
  requirement_code text not null,
  requirement_type text not null default 'DOCUMENT' check(requirement_type in ('DOCUMENT','MASTER_DATA','SERVICE_AGREEMENT','BILLING','COMPLIANCE','OTHER')),
  label text not null,
  required boolean not null default true,
  status text not null default 'PENDING' check(status in ('PENDING','SATISFIED','WAIVED')),
  document_id uuid references public.documents(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(onboarding_profile_id,requirement_code)
);

alter table public.entity_onboarding_profiles enable row level security;
alter table public.entity_onboarding_requirements enable row level security;

drop policy if exists entity_onboarding_profiles_org_access on public.entity_onboarding_profiles;
create policy entity_onboarding_profiles_org_access on public.entity_onboarding_profiles for all using (nodara_is_org_member(organization_id)) with check (nodara_is_org_member(organization_id));
drop policy if exists entity_onboarding_requirements_org_access on public.entity_onboarding_requirements;
create policy entity_onboarding_requirements_org_access on public.entity_onboarding_requirements for all using (nodara_is_org_member(organization_id)) with check (nodara_is_org_member(organization_id));

insert into public.entity_onboarding_profiles(organization_id,entity_id,status,metadata)
select e.organization_id,e.id,'NOT_STARTED',jsonb_build_object('source','CANONICAL_MIGRATION')
from public.entities e
where e.organization_id is not null
on conflict(organization_id,entity_id) do nothing;