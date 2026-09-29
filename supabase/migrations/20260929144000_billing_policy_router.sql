-- Billing policy router and invoice-ready charge discipline.
create unique index if not exists operational_charges_quote_line_tx_uq on public.operational_charges(transaction_id,quote_line_id) where quote_line_id is not null;
alter table public.operational_charges add column if not exists invoice_id uuid references public.customer_invoices(id) on delete set null;

create or replace function public.nodara_apply_billing_policy(p_charge_id uuid,p_shipment_transaction_id uuid default null)
returns public.operational_charges language plpgsql security invoker set search_path=public as $$
declare c operational_charges%rowtype;p customer_billing_policies%rowtype;bt transactions%rowtype;v_billable timestamptz;v_group text;
begin
 select * into c from operational_charges where id=p_charge_id;
 if c.id is null then raise exception 'Charge not found';end if;
 if not nodara_is_org_member(c.organization_id) then raise exception 'Workspace access denied';end if;
 select * into p from customer_billing_policies where organization_id=c.organization_id and customer_id=c.customer_id and active and effective_from<=current_date and (effective_to is null or effective_to>=current_date) order by effective_from desc limit 1;
 if p.id is null then
   update operational_charges set billing_mode=coalesce(billing_mode,'MANUAL'),billable_at=null,billing_group_key=coalesce(billing_group_key,'MANUAL:'||c.customer_id::text) where id=c.id returning * into c;return c;
 end if;
 if p.billing_mode='IMMEDIATE' then v_billable:=coalesce(c.performed_at,now());v_group:='IMMEDIATE:'||c.customer_id::text;
 elsif p.billing_mode='PERIODIC' then
   v_billable:=case p.cadence when 'DAILY' then date_trunc('day',coalesce(c.performed_at,now()))+interval '1 day'
    when 'WEEKLY' then date_trunc('week',coalesce(c.performed_at,now()))+interval '1 week'
    when 'SEMIMONTHLY' then case when extract(day from coalesce(c.performed_at,now()))<=15 then date_trunc('month',coalesce(c.performed_at,now()))+interval '15 day' else date_trunc('month',coalesce(c.performed_at,now()))+interval '1 month' end
    else date_trunc('month',coalesce(c.performed_at,now()))+interval '1 month' end;
   v_group:='PERIODIC:'||c.customer_id::text||':'||to_char(v_billable,'YYYY-MM-DD');
 elsif p.billing_mode='SHIPMENT' then
   if p_shipment_transaction_id is not null then select * into bt from transactions where id=p_shipment_transaction_id and organization_id=c.organization_id and transaction_type='SHIPMENT';if bt.id is null then raise exception 'Shipment billing target is invalid';end if;end if;
   v_billable:=case when bt.id is not null then now() else null end;v_group:=case when bt.id is not null then 'SHIPMENT:'||bt.id::text else 'SHIPMENT:UNASSIGNED:'||c.customer_id::text end;
 else v_billable:=null;v_group:='MANUAL:'||c.customer_id::text;end if;
 update operational_charges set billing_policy_id=p.id,billing_mode=p.billing_mode,billable_at=v_billable,billing_group_key=v_group,bill_on_transaction_id=coalesce(bt.id,bill_on_transaction_id),transferred_at=case when bt.id is not null then now() else transferred_at end,margin_amount=coalesce(sell_amount,0)-coalesce(buy_amount,estimated_buy_amount,0) where id=c.id returning * into c;return c;
end $$;

create or replace function public.nodara_assign_charge_to_shipment(p_charge_id uuid,p_shipment_transaction_id uuid)
returns public.operational_charges language plpgsql security invoker set search_path=public as $$
declare c operational_charges%rowtype;
begin select * into c from operational_charges where id=p_charge_id;if c.id is null then raise exception 'Charge not found';end if;
 update operational_charges set billing_mode='SHIPMENT',bill_on_transaction_id=p_shipment_transaction_id,billable_at=now(),billing_group_key='SHIPMENT:'||p_shipment_transaction_id::text,transferred_at=now() where id=p_charge_id;
 return nodara_apply_billing_policy(p_charge_id,p_shipment_transaction_id);end $$;

create or replace function public.nodara_complete_service_request(p_request_id uuid,p_quantity numeric default null,p_unit text default null,p_evidence jsonb default '[]'::jsonb)
returns public.service_requests language plpgsql security invoker set search_path=public as $$
declare r service_requests%rowtype;tx transactions%rowtype;cid uuid;
begin select * into r from service_requests where id=p_request_id;if r.id is null then raise exception 'Service request not found';end if;
 if r.commercial_disposition='PENDING' then raise exception 'Commercial disposition is required before completion';end if;
 if r.commercial_disposition='BILLABLE' and (r.service_id is null or r.estimated_rate is null) then raise exception 'Billable service requires service and approved rate';end if;
 select * into tx from transactions where organization_id=r.organization_id and transaction_type=upper(r.target_type) and domain_record_id=r.target_id limit 1;
 if r.commercial_disposition='BILLABLE' then
  if tx.id is null then raise exception 'Billable service cannot complete until its canonical transaction exists';end if;
  if r.charge_id is not null then cid:=r.charge_id;else
   select nodara_realize_charge(tx.id,r.service_id,coalesce(p_quantity,r.estimated_quantity,1),coalesce(p_unit,r.estimated_unit,'EA'),r.estimated_rate,r.currency,null,null,coalesce(r.instructions,'Requested service'),r.customer_id,null,jsonb_build_object('service_request_id',r.id,'requested_by_type',r.requested_by_type)) into cid;
   update operational_charges set performed_at=now(),originating_transaction_id=tx.id where id=cid;perform nodara_apply_billing_policy(cid,null);
  end if;
 end if;
 update service_requests set status='COMPLETED',completed_quantity=coalesce(p_quantity,estimated_quantity),completed_unit=coalesce(p_unit,estimated_unit),completed_at=now(),completion_evidence=coalesce(p_evidence,'[]'::jsonb),charge_id=cid,updated_at=now() where id=r.id returning * into r;return r;
end $$;

grant execute on function public.nodara_apply_billing_policy(uuid,uuid) to authenticated;
grant execute on function public.nodara_assign_charge_to_shipment(uuid,uuid) to authenticated;
notify pgrst,'reload schema';