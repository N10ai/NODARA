-- NODARA consolidation movement hierarchy
create table if not exists public.consolidation_masters (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 consolidation_id uuid not null references public.consolidations(id) on delete cascade,
 master_number text,
 booking_reference text,
 carrier_name text,
 origin_code text,
 destination_code text,
 vessel_voyage text,
 status text not null default 'PLANNING',
 sequence_no integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.consolidation_containers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 consolidation_id uuid not null references public.consolidations(id) on delete cascade,
 master_id uuid references public.consolidation_masters(id) on delete set null,
 container_number text,
 equipment_type text,
 seal_number text,
 capacity_cbm numeric,
 capacity_weight numeric,
 tare_weight numeric,
 status text not null default 'PLANNING',
 sequence_no integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.consolidation_container_cargo (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 container_id uuid not null references public.consolidation_containers(id) on delete cascade,
 consolidation_house_id uuid references public.consolidation_houses(id) on delete cascade,
 shipment_id uuid references public.shipments(id) on delete cascade,
 pieces numeric,
 weight numeric,
 volume_cbm numeric,
 created_at timestamptz not null default now(),
 unique(container_id,consolidation_house_id)
);
create index if not exists idx_con_masters_con on public.consolidation_masters(consolidation_id);
create index if not exists idx_con_containers_con on public.consolidation_containers(consolidation_id);
create index if not exists idx_con_containers_master on public.consolidation_containers(master_id);
create index if not exists idx_con_container_cargo_container on public.consolidation_container_cargo(container_id);
alter table public.consolidation_masters enable row level security;
alter table public.consolidation_containers enable row level security;
alter table public.consolidation_container_cargo enable row level security;
drop policy if exists "org consolidation masters" on public.consolidation_masters;
create policy "org consolidation masters" on public.consolidation_masters for all using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid())) with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
drop policy if exists "org consolidation containers" on public.consolidation_containers;
create policy "org consolidation containers" on public.consolidation_containers for all using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid())) with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
drop policy if exists "org consolidation container cargo" on public.consolidation_container_cargo;
create policy "org consolidation container cargo" on public.consolidation_container_cargo for all using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid())) with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
