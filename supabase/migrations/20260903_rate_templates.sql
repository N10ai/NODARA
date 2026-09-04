create table if not exists public.rate_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null,
  name text not null,
  domain text not null check (domain in ('WAREHOUSE','AIR','OCEAN','GROUND','FTZ','BROKERAGE','OTHER')),
  description text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,code)
);

create table if not exists public.rate_template_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null references public.rate_templates(id) on delete cascade,
  service_id uuid not null references public.service_catalog(id) on delete cascade,
  default_unit text not null,
  default_sell_rate numeric(14,4),
  default_buy_rate numeric(14,4),
  minimum_charge numeric(14,2),
  required boolean not null default false,
  auto_charge_event text,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(template_id,service_id)
);

create table if not exists public.customer_service_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null references public.entities(id) on delete cascade,
  template_id uuid not null references public.rate_templates(id) on delete cascade,
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(customer_id,template_id,effective_from)
);

create index if not exists rate_templates_org_domain_idx on public.rate_templates(organization_id,domain,active);
create index if not exists rate_template_lines_template_idx on public.rate_template_lines(template_id,sort_order);
create index if not exists customer_templates_customer_idx on public.customer_service_templates(customer_id,active);
notify pgrst, 'reload schema';