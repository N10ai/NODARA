-- NODARA-native invoicing: immutable issued invoices backed by canonical operational charges.
alter table public.customer_invoices add column if not exists issued_at timestamptz;
alter table public.customer_invoices add column if not exists issued_by uuid;
alter table public.customer_invoices add column if not exists voided_at timestamptz;
alter table public.customer_invoices add column if not exists void_reason text;
alter table public.customer_invoices add column if not exists terms_days integer not null default 30;
alter table public.customer_invoices add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.customer_payments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 customer_id uuid not null references public.entities(id) on delete restrict,payment_number text not null,payment_date date not null default current_date,
 amount numeric(14,2) not null check(amount>0),currency text not null default 'USD',method text,reference text,status text not null default 'POSTED' check(status in('DRAFT','POSTED','VOID')),
 notes text,created_at timestamptz not null default now(),unique(organization_id,payment_number)
);
create table if not exists public.customer_payment_allocations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 payment_id uuid not null references public.customer_payments(id) on delete restrict,invoice_id uuid not null references public.customer_invoices(id) on delete restrict,
 amount numeric(14,2) not null check(amount>0),created_at timestamptz not null default now(),unique(payment_id,invoice_id)
);
alter table public.customer_payments enable row level security;alter table public.customer_payment_allocations enable row level security;
create policy customer_payments_org_access on public.customer_payments for all to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));
create policy customer_payment_allocations_org_access on public.customer_payment_allocations for all to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));

create or replace function public.nodara_create_invoice_from_charges(p_organization_id uuid,p_customer_id uuid,p_charge_ids uuid[],p_invoice_date date default current_date,p_terms_days int default 30)
returns uuid language plpgsql security invoker set search_path=public as $$
declare iid uuid;ino text;sub numeric;cur text;cnt int;
begin
 if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;
 select count(*),coalesce(sum(sell_amount),0),min(currency) into cnt,sub,cur from operational_charges where organization_id=p_organization_id and customer_id=p_customer_id and id=any(p_charge_ids) and billing_status in('UNBILLED','READY') and invoice_id is null and coalesce(billable_at,performed_at,created_at)<=now();
 if cnt<>cardinality(p_charge_ids) or cnt=0 then raise exception 'One or more charges are not invoice-ready';end if;
 if exists(select 1 from operational_charges where organization_id=p_organization_id and customer_id=p_customer_id and id=any(p_charge_ids) group by currency having count(distinct currency)>1) then raise exception 'An invoice cannot mix currencies';end if;
 ino:='INV-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into customer_invoices(organization_id,invoice_number,customer_id,status,invoice_date,due_date,currency,subtotal,total,balance,terms_days,source_snapshot)
 values(p_organization_id,ino,p_customer_id,'DRAFT',p_invoice_date,p_invoice_date+greatest(p_terms_days,0),coalesce(cur,'USD'),sub,sub,sub,greatest(p_terms_days,0),jsonb_build_object('charge_ids',p_charge_ids,'created_from','OPERATIONAL_CHARGES')) returning id into iid;
 insert into customer_invoice_lines(organization_id,invoice_id,charge_id,description,quantity,unit,rate,amount,source_label,service_date,metadata)
 select p_organization_id,iid,id,description,quantity,unit,sell_rate,sell_amount,coalesce(source_type,'SERVICE'),coalesce(performed_at,created_at)::date,jsonb_build_object('originating_transaction_id',originating_transaction_id,'bill_on_transaction_id',bill_on_transaction_id,'rate_source',rate_source,'quote_id',quote_id)
 from operational_charges where organization_id=p_organization_id and id=any(p_charge_ids);
 update operational_charges set invoice_id=iid,billing_status='BILLED' where organization_id=p_organization_id and id=any(p_charge_ids);
 return iid;
end $$;

create or replace function public.nodara_issue_invoice(p_invoice_id uuid)
returns public.customer_invoices language plpgsql security invoker set search_path=public as $$
declare i customer_invoices%rowtype;
begin select * into i from customer_invoices where id=p_invoice_id;if i.id is null then raise exception 'Invoice not found';end if;if not nodara_is_org_member(i.organization_id) then raise exception 'Workspace access denied';end if;
 if i.status<>'DRAFT' and i.status<>'READY' then raise exception 'Only draft or ready invoices can be issued';end if;
 if not exists(select 1 from customer_invoice_lines where invoice_id=i.id) then raise exception 'Invoice has no lines';end if;
 update customer_invoices set status='ISSUED',issued_at=now(),issued_by=auth.uid(),updated_at=now() where id=i.id returning * into i;return i;end $$;

create or replace function public.nodara_void_invoice(p_invoice_id uuid,p_reason text)
returns public.customer_invoices language plpgsql security invoker set search_path=public as $$
declare i customer_invoices%rowtype;
begin select * into i from customer_invoices where id=p_invoice_id;if i.id is null then raise exception 'Invoice not found';end if;if not nodara_is_org_member(i.organization_id) then raise exception 'Workspace access denied';end if;
 if i.status='PAID' then raise exception 'Paid invoice cannot be voided; use a financial adjustment';end if;if coalesce(trim(p_reason),'')='' then raise exception 'Void reason is required';end if;
 update operational_charges set invoice_id=null,billing_status='READY' where invoice_id=i.id;
 update customer_invoices set status='VOID',voided_at=now(),void_reason=p_reason,balance=0,updated_at=now() where id=i.id returning * into i;return i;end $$;

grant select,insert,update on public.customer_payments,public.customer_payment_allocations to authenticated;
grant execute on function public.nodara_create_invoice_from_charges(uuid,uuid,uuid[],date,int) to authenticated;
grant execute on function public.nodara_issue_invoice(uuid) to authenticated;
grant execute on function public.nodara_void_invoice(uuid,text) to authenticated;
notify pgrst,'reload schema';