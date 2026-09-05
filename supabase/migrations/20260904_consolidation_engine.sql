create table if not exists public.consolidations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 consolidation_number text not null, mode text not null check(mode in ('AIR','OCEAN')),
 status text not null default 'PLANNING', origin_code text, destination_code text,
 master_reference text, booking_reference text, carrier_id uuid references public.entities(id) on delete set null,
 equipment_type text, equipment_reference text, seal_number text,
 etd timestamptz, eta timestamptz, capacity_weight numeric, capacity_cbm numeric,
 notes text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,consolidation_number)
);
create table if not exists public.consolidation_houses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 consolidation_id uuid not null references public.consolidations(id) on delete cascade,
 shipment_id uuid not null references public.shipments(id) on delete cascade,
 sequence_no integer, readiness jsonb not null default '{}'::jsonb,
 load_plan jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 unique(consolidation_id,shipment_id)
);
create index if not exists consolidations_org_idx on public.consolidations(organization_id,created_at desc);
create index if not exists consolidation_houses_parent_idx on public.consolidation_houses(organization_id,consolidation_id);
do $$ declare t text; begin foreach t in array array['consolidations','consolidation_houses'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists %I on public.%I',t||'_org_access',t);
 if to_regprocedure('public.nodara_is_org_member(uuid)') is not null then execute format('create policy %I on public.%I for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id))',t||'_org_access',t); end if;
 execute format('grant select,insert,update,delete on public.%I to authenticated',t); end loop; end $$;
notify pgrst,'reload schema';