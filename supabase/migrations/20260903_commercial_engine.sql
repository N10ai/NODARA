-- NODARA commercial engine foundation
-- Standard rates -> customer agreements -> spot overrides -> operational charges -> vendor actuals -> invoices

create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null,
  name text not null,
  domain text not null check (domain in ('WAREHOUSE','AIR','OCEAN','GROUND','FTZ','BROKERAGE','OTHER')),
  description text,
  default_unit text not null default 'EA',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,code)
);

create table if not exists public.standard_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_id uuid not null references public.service_catalog(id) on delete cascade,
  sell_rate numeric(14,4),
  buy_rate numeric(14,4),
  currency text not null default 'USD',
  unit text not null,
  minimum_charge numeric(14,2),
  effective_from date not null default current_date,
  effective_to date,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null references public.entities(id) on delete cascade,
  billing_mode text not null default 'PER_TRANSACTION' check (billing_mode in ('PER_TRANSACTION','JOB_COMPLETION','CONSOLIDATED','SCHEDULED','MANUAL')),
  schedule_rule text,
  auto_generate_invoice boolean not null default false,
  auto_send_invoice boolean not null default false,
  billing_email text,
  billing_conversation_id uuid,
  require_pod boolean not null default false,
  require_vendor_actuals boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,customer_id)
);

create table if not exists public.customer_rate_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null references public.entities(id) on delete cascade,
  service_id uuid not null references public.service_catalog(id) on delete cascade,
  standard_rate_id uuid references public.standard_rates(id) on delete set null,
  sell_rate numeric(14,4) not null,
  currency text not null default 'USD',
  unit text not null,
  minimum_charge numeric(14,2),
  effective_from date not null default current_date,
  effective_to date,
  active boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.entities(id) on delete set null,
  purpose text not null default 'OPERATIONS',
  subject text,
  external_thread_id text,
  participants jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid references public.entities(id) on delete set null,
  vendor_id uuid references public.entities(id) on delete set null,
  service_id uuid references public.service_catalog(id) on delete set null,
  source_type text not null,
  source_id uuid,
  source_event text,
  description text not null,
  quantity numeric(14,4) not null default 1,
  unit text not null default 'EA',
  sell_rate numeric(14,4),
  sell_amount numeric(14,2),
  estimated_buy_rate numeric(14,4),
  estimated_buy_amount numeric(14,2),
  actual_buy_amount numeric(14,2),
  currency text not null default 'USD',
  rate_source text,
  rate_source_id uuid,
  billing_status text not null default 'UNBILLED' check (billing_status in ('UNBILLED','READY','INVOICED','VOID')),
  vendor_status text not null default 'NOT_REQUIRED' check (vendor_status in ('NOT_REQUIRED','AWAITING_BILL','RECEIVED','RECONCILED')),
  customer_invoice_id uuid,
  vendor_invoice_number text,
  vendor_reference text,
  vendor_invoice_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_catalog_org_domain_idx on public.service_catalog(organization_id,domain);
create index if not exists standard_rates_service_idx on public.standard_rates(service_id,active,effective_from);
create index if not exists customer_rates_customer_idx on public.customer_rate_agreements(customer_id,service_id,active);
create index if not exists operational_charges_source_idx on public.operational_charges(source_type,source_id);
create index if not exists operational_charges_customer_idx on public.operational_charges(customer_id,billing_status);
create index if not exists operational_charges_vendor_idx on public.operational_charges(vendor_id,vendor_status);
create index if not exists operational_conversations_entity_idx on public.operational_conversations(entity_id,purpose);

comment on table public.service_catalog is 'Canonical billable services across warehouse, forwarding, transportation, FTZ and brokerage.';
comment on table public.standard_rates is 'Company standard sell/buy rate book used as the commercial baseline.';
comment on table public.customer_rate_agreements is 'Negotiated recurring customer rates layered over the standard rate book.';
comment on table public.operational_charges is 'Event-generated commercial ledger linking operations to sell charges and vendor costs.';
comment on table public.operational_conversations is 'Stored customer/vendor email conversation references for operational and billing communication.';
