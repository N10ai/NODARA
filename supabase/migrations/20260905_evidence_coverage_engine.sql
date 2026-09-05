-- NODARA Evidence & Coverage Engine
create table if not exists public.evidence_records (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 evidence_type text not null, reference text, title text, document_id uuid,
 status text not null default 'ACTIVE', issued_at timestamptz, expires_at timestamptz,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.evidence_coverage (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 evidence_id uuid not null references public.evidence_records(id) on delete cascade,
 target_type text not null, target_id uuid not null,
 coverage_role text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(evidence_id,target_type,target_id,coverage_role)
);
create table if not exists public.readiness_requirements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 owner_type text not null, owner_id uuid not null,
 requirement_code text not null, label text not null,
 scope text not null check(scope in ('MASTER','HOUSE','CARGO','ITEM')),
 evidence_type text, required boolean not null default true,
 manual_override text check(manual_override is null or manual_override in ('READY','PENDING','NA')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,owner_type,owner_id,requirement_code,scope)
);
create index if not exists evidence_records_org_type_idx on public.evidence_records(organization_id,evidence_type);
create index if not exists evidence_coverage_target_idx on public.evidence_coverage(organization_id,target_type,target_id);
create index if not exists readiness_requirements_owner_idx on public.readiness_requirements(organization_id,owner_type,owner_id);
do $$ declare t text; begin foreach t in array array['evidence_records','evidence_coverage','readiness_requirements'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists %I on public.%I',t||'_org_access',t);
 if to_regprocedure('public.nodara_is_org_member(uuid)') is not null then execute format('create policy %I on public.%I for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id))',t||'_org_access',t); end if;
 execute format('grant select,insert,update,delete on public.%I to authenticated',t); end loop; end $$;
notify pgrst,'reload schema';