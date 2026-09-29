-- Canonical organization identity, facilities and issuing identities.
alter table public.organizations add column if not exists legal_name text;
alter table public.organizations add column if not exists trade_name text;
alter table public.organizations add column if not exists phone text;
alter table public.organizations add column if not exists email text;
alter table public.organizations add column if not exists website text;
alter table public.organizations add column if not exists tax_id text;
alter table public.organizations add column if not exists logo_path text;
alter table public.organizations add column if not exists timezone text not null default 'America/New_York';
alter table public.organizations add column if not exists currency text not null default 'USD';
alter table public.organizations add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.organization_facilities(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 code text not null, name text not null, facility_type text not null default 'WAREHOUSE',
 line1 text, line2 text, city text, state_region text, postal_code text, country_code text not null default 'US',
 phone text, email text, latitude numeric, longitude numeric, firm_code text, ftz_zone text,
 is_default_warehouse boolean not null default false, is_active boolean not null default true,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,code)
);
create unique index if not exists org_default_warehouse_uq on public.organization_facilities(organization_id) where is_default_warehouse and is_active;

create table if not exists public.organization_issuing_profiles(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 mode text not null check(mode in ('AIR','OCEAN','GROUND','WAREHOUSE','GENERAL')),
 profile_name text not null, issuing_name text not null, address_text text, phone text, email text,
 iata_code text, iata_account_number text, fmc_number text, scac text, bond_number text,
 default_for_mode boolean not null default false, active boolean not null default true,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists org_issuing_default_uq on public.organization_issuing_profiles(organization_id,mode) where default_for_mode and active;
alter table public.organization_facilities enable row level security;alter table public.organization_issuing_profiles enable row level security;
do $$ begin
 create policy organization_facilities_org_access on public.organization_facilities for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
 create policy organization_issuing_profiles_org_access on public.organization_issuing_profiles for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
exception when duplicate_object then null; end $$;
grant select,insert,update,delete on public.organization_facilities,public.organization_issuing_profiles to authenticated;

create or replace function public.nodara_default_warehouse(p_organization_id uuid)
returns public.organization_facilities language sql stable security invoker set search_path=public as $$
 select * from organization_facilities where organization_id=p_organization_id and is_active order by is_default_warehouse desc,created_at limit 1 $$;
grant execute on function public.nodara_default_warehouse(uuid) to authenticated;
notify pgrst,'reload schema';