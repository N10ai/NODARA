-- Canonical cargo lines for Transport Orders
create table if not exists public.transport_order_cargo (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 transport_order_id uuid not null references public.transport_orders(id) on delete cascade,
 cargo_unit_id uuid null, line_no integer not null default 1, quantity numeric not null default 1,
 package_type text not null default 'PCS', description text, commodity text, marks_numbers text,
 length numeric, width numeric, height numeric, dimension_unit text not null default 'IN',
 gross_weight numeric, weight_unit text not null default 'KG', volume_cbm numeric,
 hazmat boolean not null default false, stackable boolean, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists transport_order_cargo_order_idx on public.transport_order_cargo(transport_order_id,line_no);
alter table public.transport_order_cargo enable row level security;
drop policy if exists transport_order_cargo_org on public.transport_order_cargo;
create policy transport_order_cargo_org on public.transport_order_cargo for all
using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()))
with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
