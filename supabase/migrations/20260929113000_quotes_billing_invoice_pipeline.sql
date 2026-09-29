-- Quote snapshots, billing disposition and invoice-ready grouping.
create table if not exists public.quotes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 quote_number text not null, customer_id uuid not null references public.entities(id) on delete restrict,
 status text not null default 'DRAFT' check(status in ('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
 mode text, service_level text, origin text, destination text, commodity text, customer_reference text,
 currency text not null default 'USD', valid_from date not null default current_date, valid_to date,
 notes text, terms text, subtotal numeric(14,2) not null default 0, estimated_cost numeric(14,2) not null default 0,
 gross_profit numeric(14,2) not null default 0, margin_percent numeric(9,4),
 accepted_at timestamptz, accepted_by uuid, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,quote_number)
);
create table if not exists public.quote_lines (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 quote_id uuid not null references public.quotes(id) on delete cascade, sort_order int not null default 100,
 service_id uuid references public.service_catalog(id) on delete set null, description text not null,
 quantity numeric(14,4) not null default 1, unit text not null default 'EA', sell_rate numeric(14,4) not null default 0,
 minimum_charge numeric(14,2), sell_amount numeric(14,2) not null default 0, estimated_buy_rate numeric(14,4),
 estimated_buy_amount numeric(14,2), currency text not null default 'USD', rate_source text, rate_source_id uuid,
 rate_snapshot jsonb not null default '{}'::jsonb, show_on_awb boolean not null default false, awb_charge_bucket text,
 invoiceable boolean not null default true, notes text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.quote_transaction_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 quote_id uuid not null references public.quotes(id) on delete cascade, transaction_id uuid not null references public.transactions(id) on delete cascade,
 link_role text not null default 'COMMERCIAL_SOURCE', created_at timestamptz not null default now(), unique(quote_id,transaction_id)
);
alter table public.operational_charges add column if not exists quote_id uuid references public.quotes(id) on delete set null;
alter table public.operational_charges add column if not exists quote_line_id uuid references public.quote_lines(id) on delete set null;

create table if not exists public.customer_invoices (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 invoice_number text not null, customer_id uuid not null references public.entities(id) on delete restrict,
 status text not null default 'DRAFT' check(status in ('DRAFT','READY','ISSUED','PARTIALLY_PAID','PAID','VOID')),
 invoice_date date not null default current_date, due_date date, currency text not null default 'USD',
 subtotal numeric(14,2) not null default 0, tax_amount numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
 balance numeric(14,2) not null default 0, billing_period_start date, billing_period_end date, notes text,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,invoice_number)
);
create table if not exists public.customer_invoice_lines (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 invoice_id uuid not null references public.customer_invoices(id) on delete cascade, charge_id uuid references public.operational_charges(id) on delete restrict,
 description text not null, quantity numeric(14,4) not null default 1, unit text not null default 'EA', rate numeric(14,4), amount numeric(14,2) not null default 0,
 source_label text, service_date date, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(invoice_id,charge_id)
);
create index if not exists quotes_customer_idx on public.quotes(organization_id,customer_id,status,created_at desc);
create index if not exists quote_lines_quote_idx on public.quote_lines(quote_id,sort_order);
create index if not exists customer_invoices_customer_idx on public.customer_invoices(organization_id,customer_id,status,invoice_date desc);

alter table public.quotes enable row level security; alter table public.quote_lines enable row level security; alter table public.quote_transaction_links enable row level security;
alter table public.customer_invoices enable row level security; alter table public.customer_invoice_lines enable row level security;
do $$ begin
 create policy quotes_org_access on public.quotes for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
 create policy quote_lines_org_access on public.quote_lines for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
 create policy quote_links_org_access on public.quote_transaction_links for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
 create policy invoices_org_access on public.customer_invoices for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
 create policy invoice_lines_org_access on public.customer_invoice_lines for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
exception when duplicate_object then null; end $$;

create or replace function public.nodara_apply_quote_to_transaction(p_quote_id uuid,p_transaction_id uuid)
returns integer language plpgsql security invoker set search_path=public as $$
declare q quotes%rowtype; tx transactions%rowtype; l quote_lines%rowtype; n int:=0; cid uuid;
begin select * into q from quotes where id=p_quote_id; select * into tx from transactions where id=p_transaction_id;
 if q.id is null or tx.id is null or q.organization_id<>tx.organization_id then raise exception 'Quote / transaction workspace mismatch'; end if;
 insert into quote_transaction_links(organization_id,quote_id,transaction_id) values(q.organization_id,q.id,tx.id) on conflict do nothing;
 for l in select * from quote_lines where quote_id=q.id and invoiceable order by sort_order loop
  insert into operational_charges(organization_id,transaction_id,customer_id,service_id,source_type,source_id,source_event,description,quantity,unit,sell_rate,sell_amount,estimated_buy_rate,estimated_buy_amount,currency,rate_source,rate_source_id,billing_status,vendor_status,quote_id,quote_line_id,show_on_awb,awb_charge_bucket,originating_transaction_id,provenance,metadata)
  values(q.organization_id,tx.id,q.customer_id,l.service_id,tx.transaction_type,tx.domain_record_id,'QUOTE_APPLIED',l.description,l.quantity,l.unit,l.sell_rate,l.sell_amount,l.estimated_buy_rate,l.estimated_buy_amount,l.currency,'QUOTE_SNAPSHOT',l.id,'UNBILLED','NOT_REQUIRED',q.id,l.id,l.show_on_awb,l.awb_charge_bucket,tx.id,jsonb_build_object('quote_id',q.id,'quote_line_id',l.id),jsonb_build_object('rate_snapshot',l.rate_snapshot))
  returning id into cid; n:=n+1;
 end loop; return n; end $$;

create or replace function public.nodara_invoice_ready_charges(p_organization_id uuid,p_customer_id uuid default null)
returns table(charge_id uuid,customer_id uuid,customer_name text,description text,quantity numeric,unit text,rate numeric,amount numeric,currency text,source_type text,source_id uuid,performed_at timestamptz,billing_mode text,billing_group_key text)
language sql stable security invoker set search_path=public as $$
 select c.id,c.customer_id,e.name,c.description,c.quantity,c.unit,c.sell_rate,c.sell_amount,c.currency,c.source_type,c.source_id,c.performed_at,c.billing_mode,c.billing_group_key
 from operational_charges c left join entities e on e.id=c.customer_id
 where c.organization_id=p_organization_id and c.billing_status in ('UNBILLED','READY') and (p_customer_id is null or c.customer_id=p_customer_id)
 and coalesce(c.billable_at,c.performed_at,c.created_at)<=now() order by e.name,coalesce(c.performed_at,c.created_at),c.created_at;
$$;
grant select,insert,update,delete on public.quotes,public.quote_lines,public.quote_transaction_links,public.customer_invoices,public.customer_invoice_lines to authenticated;
grant execute on function public.nodara_apply_quote_to_transaction(uuid,uuid) to authenticated;
grant execute on function public.nodara_invoice_ready_charges(uuid,uuid) to authenticated;
notify pgrst,'reload schema';