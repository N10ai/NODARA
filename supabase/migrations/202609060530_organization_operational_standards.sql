create table if not exists public.organization_operational_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  transaction_type text not null,
  service_id uuid null references public.service_catalog(id) on delete set null,
  requirement_code text not null,
  requirement_type text not null default 'OTHER',
  label text not null,
  scope text not null default 'TRANSACTION',
  blocking boolean not null default false,
  repeat_mode text not null default 'ONCE',
  conditions jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  active boolean not null default true,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, transaction_type, service_id, requirement_code)
);
alter table public.organization_operational_requirements enable row level security;
create policy organization_operational_requirements_org_access on public.organization_operational_requirements
for all to authenticated
using (nodara_is_org_member(organization_id))
with check (nodara_is_org_member(organization_id));
grant select,insert,update,delete on public.organization_operational_requirements to authenticated;
create index if not exists idx_org_operational_req_lookup on public.organization_operational_requirements(organization_id,transaction_type,service_id,active);
