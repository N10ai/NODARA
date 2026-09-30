-- Native NODARA payables + customer payment allocation.
create table if not exists public.vendor_bills(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 vendor_id uuid not null references public.entities(id) on delete restrict,bill_number text not null,vendor_invoice_number text,
 status text not null default 'DRAFT' check(status in('DRAFT','APPROVED','PARTIALLY_PAID','PAID','VOID')),
 bill_date date not null default current_date,due_date date,currency text not null default 'USD',subtotal numeric(14,2) not null default 0,
 tax_amount numeric(14,2) not null default 0,total numeric(14,2) not null default 0,balance numeric(14,2) not null default 0,
 notes text,approved_at timestamptz,approved_by uuid,voided_at timestamptz,void_reason text,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,bill_number)
);
create table if not exists public.vendor_bill_lines(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 bill_id uuid not null references public.vendor_bills(id) on delete cascade,charge_id uuid references public.operational_charges(id) on delete restrict,
 description text not null,quantity numeric(14,4) not null default 1,unit text not null default 'EA',rate numeric(14,4),amount numeric(14,2) not null default 0,
 source_label text,service_date date,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique(bill_id,charge_id)
);
create table if not exists public.vendor_payments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 vendor_id uuid not null references public.entities(id) on delete restrict,payment_number text not null,payment_date date not null default current_date,
 amount numeric(14,2) not null check(amount>0),currency text not null default 'USD',method text,reference text,status text not null default 'POSTED' check(status in('DRAFT','POSTED','VOID')),
 notes text,created_at timestamptz not null default now(),unique(organization_id,payment_number)
);
create table if not exists public.vendor_payment_allocations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 payment_id uuid not null references public.vendor_payments(id) on delete restrict,bill_id uuid not null references public.vendor_bills(id) on delete restrict,
 amount numeric(14,2) not null check(amount>0),created_at timestamptz not null default now(),unique(payment_id,bill_id)
);
alter table public.operational_charges add column if not exists vendor_bill_id uuid references public.vendor_bills(id) on delete set null;
alter table public.vendor_bills enable row level security;alter table public.vendor_bill_lines enable row level security;alter table public.vendor_payments enable row level security;alter table public.vendor_payment_allocations enable row level security;
do $$ begin
 create policy vendor_bills_org_access on vendor_bills for all to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));
 create policy vendor_bill_lines_org_access on vendor_bill_lines for all to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));
 create policy vendor_payments_org_access on vendor_payments for all to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));
 create policy vendor_payment_allocations_org_access on vendor_payment_allocations for all to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));
exception when duplicate_object then null;end $$;

create or replace function public.nodara_create_vendor_bill(p_organization_id uuid,p_vendor_id uuid,p_charge_ids uuid[],p_vendor_invoice_number text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare bid uuid;bno text;tot numeric;cur text;cnt int;
begin if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;
 select count(*),coalesce(sum(coalesce(buy_amount,estimated_buy_amount,0)),0),min(coalesce(vendor_currency,currency,'USD')) into cnt,tot,cur from operational_charges where organization_id=p_organization_id and vendor_id=p_vendor_id and id=any(p_charge_ids) and vendor_bill_id is null and coalesce(buy_amount,estimated_buy_amount,0)>0;
 if cnt<>cardinality(p_charge_ids) or cnt=0 then raise exception 'One or more vendor charges are not billable';end if;
 bno:='VB-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into vendor_bills(organization_id,vendor_id,bill_number,vendor_invoice_number,currency,subtotal,total,balance)
 values(p_organization_id,p_vendor_id,bno,nullif(trim(p_vendor_invoice_number),''),coalesce(cur,'USD'),tot,tot,tot) returning id into bid;
 insert into vendor_bill_lines(organization_id,bill_id,charge_id,description,quantity,unit,rate,amount,source_label,service_date,metadata)
 select p_organization_id,bid,id,description,quantity,unit,coalesce(buy_rate,estimated_buy_rate),coalesce(buy_amount,estimated_buy_amount,0),coalesce(source_type,'SERVICE'),coalesce(performed_at,created_at)::date,jsonb_build_object('originating_transaction_id',originating_transaction_id,'transaction_id',transaction_id)
 from operational_charges where organization_id=p_organization_id and id=any(p_charge_ids);
 update operational_charges set vendor_bill_id=bid,vendor_status='RECEIVED' where organization_id=p_organization_id and id=any(p_charge_ids);return bid;end $$;

create or replace function public.nodara_approve_vendor_bill(p_bill_id uuid) returns public.vendor_bills language plpgsql security invoker set search_path=public as $$
declare b vendor_bills%rowtype;begin select * into b from vendor_bills where id=p_bill_id;if b.id is null then raise exception 'Vendor bill not found';end if;if not nodara_is_org_member(b.organization_id) then raise exception 'Workspace access denied';end if;if b.status<>'DRAFT' then raise exception 'Only draft vendor bills can be approved';end if;update vendor_bills set status='APPROVED',approved_at=now(),approved_by=auth.uid(),updated_at=now() where id=b.id returning * into b;return b;end $$;

create or replace function public.nodara_post_customer_payment(p_organization_id uuid,p_customer_id uuid,p_amount numeric,p_currency text,p_method text,p_reference text,p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare pid uuid;pno text;a jsonb;remaining numeric:=p_amount;i customer_invoices%rowtype;amt numeric;
begin if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;if p_amount<=0 then raise exception 'Payment must be positive';end if;
 pno:='RCPT-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into customer_payments(organization_id,customer_id,payment_number,amount,currency,method,reference) values(p_organization_id,p_customer_id,pno,p_amount,coalesce(p_currency,'USD'),p_method,p_reference) returning id into pid;
 for a in select * from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop amt:=(a->>'amount')::numeric;select * into i from customer_invoices where id=(a->>'invoice_id')::uuid and organization_id=p_organization_id and customer_id=p_customer_id for update;if i.id is null or i.status not in('ISSUED','PARTIALLY_PAID') then raise exception 'Invalid invoice allocation';end if;if amt<=0 or amt>i.balance or amt>remaining then raise exception 'Invalid allocation amount';end if;
 insert into customer_payment_allocations(organization_id,payment_id,invoice_id,amount) values(p_organization_id,pid,i.id,amt);update customer_invoices set balance=balance-amt,status=case when balance-amt<=0 then 'PAID' else 'PARTIALLY_PAID' end,updated_at=now() where id=i.id;remaining:=remaining-amt;end loop;return pid;end $$;

create or replace function public.nodara_post_vendor_payment(p_organization_id uuid,p_vendor_id uuid,p_amount numeric,p_currency text,p_method text,p_reference text,p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare pid uuid;pno text;a jsonb;remaining numeric:=p_amount;b vendor_bills%rowtype;amt numeric;
begin if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;if p_amount<=0 then raise exception 'Payment must be positive';end if;
 pno:='PAY-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into vendor_payments(organization_id,vendor_id,payment_number,amount,currency,method,reference) values(p_organization_id,p_vendor_id,pno,p_amount,coalesce(p_currency,'USD'),p_method,p_reference) returning id into pid;
 for a in select * from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop amt:=(a->>'amount')::numeric;select * into b from vendor_bills where id=(a->>'bill_id')::uuid and organization_id=p_organization_id and vendor_id=p_vendor_id for update;if b.id is null or b.status not in('APPROVED','PARTIALLY_PAID') then raise exception 'Invalid vendor bill allocation';end if;if amt<=0 or amt>b.balance or amt>remaining then raise exception 'Invalid allocation amount';end if;
 insert into vendor_payment_allocations(organization_id,payment_id,bill_id,amount) values(p_organization_id,pid,b.id,amt);update vendor_bills set balance=balance-amt,status=case when balance-amt<=0 then 'PAID' else 'PARTIALLY_PAID' end,updated_at=now() where id=b.id;remaining:=remaining-amt;end loop;return pid;end $$;

grant select,insert,update on public.vendor_bills,public.vendor_bill_lines,public.vendor_payments,public.vendor_payment_allocations to authenticated;
grant execute on function public.nodara_create_vendor_bill(uuid,uuid,uuid[],text) to authenticated;
grant execute on function public.nodara_approve_vendor_bill(uuid) to authenticated;
grant execute on function public.nodara_post_customer_payment(uuid,uuid,numeric,text,text,text,jsonb) to authenticated;
grant execute on function public.nodara_post_vendor_payment(uuid,uuid,numeric,text,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';