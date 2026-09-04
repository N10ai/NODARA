-- NODARA Operations Backbone
-- Unified shipments + pickup/delivery/transfer/drayage transport orders + cross-record links.

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  shipment_number text not null,
  mode text not null check (mode in ('AIR','OCEAN','GROUND')),
  direction text check (direction in ('IMPORT','EXPORT','DOMESTIC','CROSS_TRADE')),
  status text not null default 'DRAFT',
  customer_id uuid references public.entities(id) on delete set null,
  shipper_id uuid references public.entities(id) on delete set null,
  consignee_id uuid references public.entities(id) on delete set null,
  carrier_id uuid references public.entities(id) on delete set null,
  origin_code text,
  origin_name text,
  destination_code text,
  destination_name text,
  reference text,
  master_reference text,
  house_reference text,
  booking_reference text,
  pieces numeric,
  weight numeric,
  weight_unit text default 'KG',
  volume_cbm numeric,
  etd timestamptz,
  eta timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shipment_number)
);

create index if not exists shipments_org_mode_idx on public.shipments(organization_id,mode,created_at desc);
create index if not exists shipments_org_status_idx on public.shipments(organization_id,status,created_at desc);

create table if not exists public.transport_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_number text not null,
  order_type text not null check (order_type in ('PICKUP','DELIVERY','TRANSFER','DRAYAGE')),
  status text not null default 'DRAFT',
  customer_id uuid references public.entities(id) on delete set null,
  carrier_id uuid references public.entities(id) on delete set null,
  pickup_entity_id uuid references public.entities(id) on delete set null,
  delivery_entity_id uuid references public.entities(id) on delete set null,
  pickup_name text,
  pickup_address text,
  delivery_name text,
  delivery_address text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_pickup_at timestamptz,
  actual_delivery_at timestamptz,
  pieces numeric,
  weight numeric,
  weight_unit text default 'KG',
  equipment text,
  driver_name text,
  vehicle_reference text,
  customer_reference text,
  carrier_reference text,
  sell_amount numeric,
  buy_amount numeric,
  currency text not null default 'USD',
  instructions text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);

create index if not exists transport_orders_org_type_idx on public.transport_orders(organization_id,order_type,created_at desc);
create index if not exists transport_orders_org_status_idx on public.transport_orders(organization_id,status,created_at desc);

-- Generic relationship ledger: links operational objects without duplicating them.
-- Examples:
-- transport_order -> warehouse_receipt (CREATED_WR)
-- cargo_release -> transport_order (DELIVERY_ORDER)
-- transport_order -> shipment (SHIPMENT_LEG)
-- warehouse_receipt -> shipment (SOURCE_CARGO)
create table if not exists public.operational_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relationship text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,source_type,source_id,target_type,target_id,relationship)
);

create index if not exists operational_links_source_idx on public.operational_links(organization_id,source_type,source_id);
create index if not exists operational_links_target_idx on public.operational_links(organization_id,target_type,target_id);

-- Organization-scoped RLS; reuses the helper already installed by NODARA commercial engine.
do $$
declare t text;
begin
  foreach t in array array['shipments','transport_orders','operational_links'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I',t||'_org_access',t);
    if to_regprocedure('public.nodara_is_org_member(uuid)') is not null then
      execute format('create policy %I on public.%I for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id))',t||'_org_access',t);
    end if;
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;

notify pgrst, 'reload schema';
