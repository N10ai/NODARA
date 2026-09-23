create table if not exists public.transport_order_references (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 transport_order_id uuid not null references public.transport_orders(id) on delete cascade,
 reference_type text not null,
 reference_value text not null,
 label text,
 is_primary boolean not null default false,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists transport_order_references_order_idx on public.transport_order_references(transport_order_id);
alter table public.transport_order_references enable row level security;
drop policy if exists transport_order_references_org on public.transport_order_references;
create policy transport_order_references_org on public.transport_order_references for all using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid())) with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
alter table public.entity_addresses add column if not exists latitude numeric;
alter table public.entity_addresses add column if not exists longitude numeric;
alter table public.entity_addresses add column if not exists formatted_address text;
alter table public.entity_addresses add column if not exists geocoding_provider text;
alter table public.entity_addresses add column if not exists geocoding_place_id text;
alter table public.transport_orders add column if not exists pickup_latitude numeric;
alter table public.transport_orders add column if not exists pickup_longitude numeric;
alter table public.transport_orders add column if not exists delivery_latitude numeric;
alter table public.transport_orders add column if not exists delivery_longitude numeric;