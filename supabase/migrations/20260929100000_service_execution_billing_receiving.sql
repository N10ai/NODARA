-- NODARA service execution, billing disposition, and inbound transport -> warehouse receiving bridge.

create table if not exists public.customer_billing_policies (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 customer_id uuid not null references public.entities(id) on delete cascade,
 name text not null default 'Default billing policy',
 billing_mode text not null default 'IMMEDIATE' check (billing_mode in ('IMMEDIATE','SHIPMENT','PERIODIC','MANUAL')),
 cadence text check (cadence in ('DAILY','WEEKLY','SEMIMONTHLY','MONTHLY')),
 auto_invoice boolean not null default false,
 consolidate_by text not null default 'CUSTOMER' check (consolidate_by in ('CUSTOMER','SHIPMENT','REFERENCE','SERVICE')),
 effective_from date not null default current_date,
 effective_to date,
 active boolean not null default true,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists customer_billing_policy_active_uq on public.customer_billing_policies(organization_id,customer_id) where active and effective_to is null;

alter table public.operational_charges add column if not exists performed_at timestamptz;
alter table public.operational_charges add column if not exists billable_at timestamptz;
alter table public.operational_charges add column if not exists billing_mode text;
alter table public.operational_charges add column if not exists billing_policy_id uuid references public.customer_billing_policies(id) on delete set null;
alter table public.operational_charges add column if not exists billing_group_key text;
alter table public.operational_charges add column if not exists bill_on_transaction_id uuid references public.transactions(id) on delete set null;
alter table public.operational_charges add column if not exists originating_transaction_id uuid references public.transactions(id) on delete set null;
alter table public.operational_charges add column if not exists transferred_at timestamptz;
alter table public.operational_charges add column if not exists buy_rate numeric;
alter table public.operational_charges add column if not exists buy_amount numeric;
alter table public.operational_charges add column if not exists margin_amount numeric;
alter table public.operational_charges add column if not exists vendor_currency text;
alter table public.operational_charges add column if not exists show_on_awb boolean not null default false;
alter table public.operational_charges add column if not exists awb_charge_bucket text;
alter table public.operational_charges add column if not exists payment_term text;
alter table public.operational_charges add column if not exists due_to text;

create table if not exists public.service_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 request_number text not null,
 customer_id uuid references public.entities(id) on delete set null,
 service_id uuid references public.service_catalog(id) on delete set null,
 target_type text not null,
 target_id uuid not null,
 requested_by_type text not null default 'EMPLOYEE' check(requested_by_type in ('CUSTOMER','EMPLOYEE','SYSTEM','EMAIL','API')),
 requested_by uuid,
 requested_at timestamptz not null default now(),
 instructions text,
 status text not null default 'REQUESTED' check(status in ('REQUESTED','PRICING_REQUIRED','APPROVED','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED','DECLINED')),
 assigned_to uuid,
 commercial_disposition text not null default 'PENDING' check(commercial_disposition in ('PENDING','BILLABLE','INCLUDED','NO_CHARGE')),
 estimated_quantity numeric,
 estimated_unit text,
 estimated_rate numeric,
 estimated_amount numeric,
 currency text not null default 'USD',
 completed_quantity numeric,
 completed_unit text,
 completed_at timestamptz,
 completion_evidence jsonb not null default '[]'::jsonb,
 charge_id uuid references public.operational_charges(id) on delete set null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,request_number)
);
create index if not exists service_requests_target_idx on public.service_requests(organization_id,target_type,target_id,status);
create index if not exists service_requests_customer_idx on public.service_requests(organization_id,customer_id,status);

create table if not exists public.transport_receiving_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 transport_order_id uuid not null references public.transport_orders(id) on delete cascade,
 warehouse_receipt_id uuid not null references public.warehouse_receipts(id) on delete cascade,
 expected_quantity numeric,
 received_quantity numeric,
 uom text not null default 'PCS',
 status text not null default 'RECEIVING' check(status in ('RECEIVING','PARTIAL','RECEIVED','CANCELLED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(transport_order_id,warehouse_receipt_id)
);
create index if not exists transport_receiving_to_idx on public.transport_receiving_links(transport_order_id,status);

alter table public.customer_billing_policies enable row level security;
alter table public.service_requests enable row level security;
alter table public.transport_receiving_links enable row level security;
drop policy if exists customer_billing_policies_org_access on public.customer_billing_policies;
create policy customer_billing_policies_org_access on public.customer_billing_policies for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists service_requests_org_access on public.service_requests;
create policy service_requests_org_access on public.service_requests for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists transport_receiving_links_org_access on public.transport_receiving_links;
create policy transport_receiving_links_org_access on public.transport_receiving_links for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

create or replace function public.nodara_incoming_transport_orders(p_organization_id uuid)
returns table(transport_order_id uuid,order_number text,customer_id uuid,customer_name text,status text,scheduled_arrival timestamptz,actual_delivery_at timestamptz,pieces numeric,weight numeric,weight_unit text,carrier_id uuid,carrier_name text,delivery_name text,delivery_address text,received_quantity numeric,receiving_state text)
language sql stable security invoker set search_path=public as $$
 select t.id,t.order_number,t.customer_id,c.name,t.status,t.scheduled_end,t.actual_delivery_at,t.pieces,t.weight,t.weight_unit,t.carrier_id,car.name,t.delivery_name,t.delivery_address,
 coalesce((select sum(coalesce(l.received_quantity,0)) from transport_receiving_links l where l.transport_order_id=t.id and l.status<>'CANCELLED'),0),
 case when exists(select 1 from transport_receiving_links l where l.transport_order_id=t.id and l.status='RECEIVING') then 'RECEIVING'
      when exists(select 1 from transport_receiving_links l where l.transport_order_id=t.id and l.status='PARTIAL') then 'PARTIAL'
      when exists(select 1 from transport_receiving_links l where l.transport_order_id=t.id and l.status='RECEIVED') and coalesce(t.pieces,0)<=coalesce((select sum(coalesce(l.received_quantity,0)) from transport_receiving_links l where l.transport_order_id=t.id and l.status<>'CANCELLED'),0) then 'RECEIVED'
      when t.actual_delivery_at is not null or upper(coalesce(t.status,'')) in ('DELIVERED','COMPLETED') then 'AT_WAREHOUSE' else 'INCOMING' end
 from transport_orders t left join entities c on c.id=t.customer_id left join entities car on car.id=t.carrier_id
 where t.organization_id=p_organization_id and upper(coalesce(t.status,''))<>'CANCELLED'
 and not (exists(select 1 from transport_receiving_links l where l.transport_order_id=t.id and l.status='RECEIVED') and coalesce(t.pieces,0)>0 and coalesce(t.pieces,0)<=coalesce((select sum(coalesce(l2.received_quantity,0)) from transport_receiving_links l2 where l2.transport_order_id=t.id and l2.status<>'CANCELLED'),0))
 order by case when t.actual_delivery_at is not null then 0 else 1 end,t.scheduled_end nulls last,t.created_at;
$$;

create or replace function public.nodara_link_transport_receipt(p_transport_order_id uuid,p_warehouse_receipt_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare t transport_orders%rowtype; w warehouse_receipts%rowtype; lid uuid;
begin
 select * into t from transport_orders where id=p_transport_order_id; select * into w from warehouse_receipts where id=p_warehouse_receipt_id;
 if t.id is null or w.id is null or t.organization_id<>w.organization_id then raise exception 'Transport Order / WR workspace mismatch'; end if;
 insert into transport_receiving_links(organization_id,transport_order_id,warehouse_receipt_id,expected_quantity,uom,status)
 values(t.organization_id,t.id,w.id,t.pieces,'PCS','RECEIVING') on conflict(transport_order_id,warehouse_receipt_id) do update set status='RECEIVING',updated_at=now() returning id into lid;
 insert into operational_links(organization_id,source_type,source_id,target_type,target_id,link_type,active,metadata)
 values(t.organization_id,'TRANSPORT_ORDER',t.id,'WAREHOUSE_RECEIPT',w.id,'RECEIVES_INTO',true,jsonb_build_object('source','WAREHOUSE_RECEIVING'))
 on conflict do nothing;
 return lid;
end $$;

create or replace function public.nodara_complete_service_request(p_request_id uuid,p_quantity numeric default null,p_unit text default null,p_evidence jsonb default '[]'::jsonb)
returns public.service_requests language plpgsql security invoker set search_path=public as $$
declare r service_requests%rowtype; tx transactions%rowtype; cid uuid;
begin
 select * into r from service_requests where id=p_request_id;
 if r.id is null then raise exception 'Service request not found'; end if;
 if r.commercial_disposition='PENDING' then raise exception 'Commercial disposition is required before completion'; end if;
 if r.commercial_disposition='BILLABLE' and (r.service_id is null or r.estimated_rate is null) then raise exception 'Billable service requires service and approved rate'; end if;
 select * into tx from transactions where organization_id=r.organization_id and transaction_type=upper(r.target_type) and domain_record_id=r.target_id limit 1;
 if r.commercial_disposition='BILLABLE' and tx.id is not null then
   select nodara_realize_charge(tx.id,r.service_id,coalesce(p_quantity,r.estimated_quantity,1),coalesce(p_unit,r.estimated_unit,'EA'),r.estimated_rate,r.currency,null,null,coalesce(r.instructions,'Requested service'),r.customer_id,null,jsonb_build_object('service_request_id',r.id,'requested_by_type',r.requested_by_type)) into cid;
   update operational_charges set performed_at=now(),originating_transaction_id=tx.id where id=cid;
 end if;
 update service_requests set status='COMPLETED',completed_quantity=coalesce(p_quantity,estimated_quantity),completed_unit=coalesce(p_unit,estimated_unit),completed_at=now(),completion_evidence=coalesce(p_evidence,'[]'::jsonb),charge_id=cid,updated_at=now() where id=r.id returning * into r;
 return r;
end $$;

grant select,insert,update,delete on public.customer_billing_policies,public.service_requests,public.transport_receiving_links to authenticated;
grant execute on function public.nodara_incoming_transport_orders(uuid) to authenticated;
grant execute on function public.nodara_link_transport_receipt(uuid,uuid) to authenticated;
grant execute on function public.nodara_complete_service_request(uuid,numeric,text,jsonb) to authenticated;
notify pgrst,'reload schema';
