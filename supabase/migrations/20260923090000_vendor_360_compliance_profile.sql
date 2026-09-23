create table if not exists public.entity_compliance_requirements(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,entity_id uuid not null references public.entities(id) on delete restrict,
 requirement_type text not null,label text not null,status text not null default 'REQUIRED',document_id uuid,issued_on date,expires_on date,
 reference text,notes text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,entity_id,requirement_type,label));
create index if not exists entity_compliance_entity_idx on public.entity_compliance_requirements(organization_id,entity_id,status,expires_on);
alter table public.entity_compliance_requirements enable row level security;
drop policy if exists entity_compliance_org on public.entity_compliance_requirements;
create policy entity_compliance_org on public.entity_compliance_requirements for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

create table if not exists public.vendor_profiles(
 organization_id uuid not null,entity_id uuid not null references public.entities(id) on delete restrict,
 approval_status text not null default 'REVIEW',payment_terms text,service_areas text[],equipment_capabilities text[],notes text,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(organization_id,entity_id));
alter table public.vendor_profiles enable row level security;
drop policy if exists vendor_profiles_org on public.vendor_profiles;
create policy vendor_profiles_org on public.vendor_profiles for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

create or replace function public.nodara_vendor_compliance_summary(p_organization_id uuid,p_vendor_id uuid)
returns jsonb language sql stable security invoker as $$
select jsonb_build_object(
 'requirements',count(*)::int,
 'missing',count(*) filter(where status in ('REQUIRED','MISSING'))::int,
 'expired',count(*) filter(where expires_on<current_date and status not in ('WAIVED','VOID'))::int,
 'expiring_30',count(*) filter(where expires_on between current_date and current_date+30 and status not in ('WAIVED','VOID'))::int
) from public.entity_compliance_requirements where organization_id=p_organization_id and entity_id=p_vendor_id;
$$;