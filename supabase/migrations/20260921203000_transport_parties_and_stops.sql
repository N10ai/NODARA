alter table public.transport_orders
 add column if not exists shipper_id uuid references public.entities(id), add column if not exists consignee_id uuid references public.entities(id),
 add column if not exists shipper_address_id uuid references public.entity_addresses(id), add column if not exists consignee_address_id uuid references public.entity_addresses(id),
 add column if not exists shipper_contact_id uuid references public.entity_contacts(id), add column if not exists consignee_contact_id uuid references public.entity_contacts(id),
 add column if not exists shipper_name text, add column if not exists shipper_address text, add column if not exists shipper_contact text,
 add column if not exists consignee_name text, add column if not exists consignee_address text, add column if not exists consignee_contact text;
create table if not exists public.transport_order_stops(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, transport_order_id uuid not null references public.transport_orders(id) on delete cascade,
 sequence_no integer not null, stop_type text not null default 'STOP', entity_id uuid references public.entities(id), address_id uuid references public.entity_addresses(id), contact_id uuid references public.entity_contacts(id),
 entity_name text, address_text text, contact_text text, appointment_reference text, instructions text, scheduled_at timestamptz, actual_at timestamptz, status text not null default 'PLANNED',
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(transport_order_id,sequence_no));
alter table public.transport_order_stops enable row level security;
drop policy if exists transport_order_stops_org on public.transport_order_stops;
create policy transport_order_stops_org on public.transport_order_stops for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create index if not exists idx_transport_order_stops_order on public.transport_order_stops(transport_order_id,sequence_no);