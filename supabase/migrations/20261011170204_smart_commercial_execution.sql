-- One commercial resolver for RFQ snapshots and recurring customer agreements.
create or replace function public.nodara_resolve_commercial_rate(p_transaction_id uuid,p_service_id uuid,p_date date default current_date)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare tx transactions%rowtype; customer uuid; result jsonb;
begin
 select * into tx from transactions where id=p_transaction_id;
 if tx.id is null or not nodara_is_org_member(tx.organization_id) then raise exception 'Operation access denied';end if;
 select entity_id into customer from transaction_parties where transaction_id=tx.id and role_code='CUSTOMER' and is_primary;
 select jsonb_build_object('source','QUOTE_SNAPSHOT','source_id',l.id,'rate',l.sell_rate,'buy_rate',l.estimated_buy_rate,'unit',l.unit,'currency',l.currency,'minimum',l.minimum_charge,'snapshot',l.rate_snapshot) into result
 from quote_lines l join quotes q on q.id=l.quote_id join quote_transaction_links link on link.quote_id=q.id and link.transaction_id=tx.id
 where q.status='ACCEPTED' and q.organization_id=tx.organization_id and q.customer_id=customer and l.service_id=p_service_id order by q.accepted_at desc,l.sort_order limit 1;
 if result is not null then return result;end if;
 select jsonb_build_object('source','CUSTOMER_AGREEMENT','source_id',r.id,'rate',r.sell_rate,'unit',r.unit,'currency',r.currency,'minimum',r.minimum_charge,'snapshot',to_jsonb(r)) into result
 from customer_rate_agreements r where r.organization_id=tx.organization_id and r.customer_id=customer and r.service_id=p_service_id and r.active and r.effective_from<=p_date and (r.effective_to is null or r.effective_to>=p_date) order by r.effective_from desc,r.updated_at desc limit 1;
 if result is not null then return result;end if;
 select jsonb_build_object('source','SERVICE_AGREEMENT','source_id',r.id,'rate',r.rate,'unit',r.unit,'currency',r.currency,'minimum',r.minimum_charge,'maximum',r.maximum_charge,'included',r.included,'snapshot',to_jsonb(r)) into result
 from service_agreement_billing_rules r join service_agreements a on a.id=r.agreement_id
 where a.organization_id=tx.organization_id and a.customer_id=customer and a.status='ACTIVE' and a.effective_from<=p_date and (a.effective_to is null or a.effective_to>=p_date) and r.service_id=p_service_id and r.active order by a.effective_from desc,r.created_at desc limit 1;
 if result is not null then return result;end if;
 select jsonb_build_object('source','STANDARD_RATE','source_id',r.id,'rate',r.sell_rate,'buy_rate',r.buy_rate,'unit',r.unit,'currency',r.currency,'minimum',r.minimum_charge,'snapshot',to_jsonb(r)) into result
 from standard_rates r where r.organization_id=tx.organization_id and r.service_id=p_service_id and r.active and r.sell_rate is not null and r.effective_from<=p_date and (r.effective_to is null or r.effective_to>=p_date) order by r.effective_from desc,r.updated_at desc limit 1;
 return coalesce(result,jsonb_build_object('source','EXCEPTION','reason','No valid rate for the service date'));
end $$;

create or replace function public.nodara_create_operation_from_quote(p_quote_id uuid,p_kind text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare q quotes%rowtype; tx transactions%rowtype; domain_id uuid; job uuid; num text;
begin
 select * into q from quotes where id=p_quote_id for update;
 if q.id is null or not nodara_is_org_member(q.organization_id) then raise exception 'Quote access denied';end if;
 if q.status<>'ACCEPTED' then raise exception 'Accept the RFQ quote before creating its operation';end if;
 if q.metadata->>'created_transaction_id' is not null then
  select * into tx from transactions where id=(q.metadata->>'created_transaction_id')::uuid and organization_id=q.organization_id;
  if tx.id is not null then return jsonb_build_object('transaction_id',tx.id,'record_id',tx.domain_record_id,'type',tx.transaction_type,'number',tx.document_number,'existing',true);end if;
 end if;
 perform set_config('nodara.creating_quote_operation',q.id::text,true);
 num:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 if p_kind='SHIPMENT' then
  if q.mode not in ('AIR','OCEAN','GROUND') then raise exception 'Choose an Air, Ocean or Ground quote mode before creating a shipment';end if;
  insert into shipments(organization_id,shipment_number,mode,status,customer_id,origin_name,destination_name,reference,notes,metadata)
  values(q.organization_id,'SHP-'||num,q.mode,'DRAFT',q.customer_id,q.origin,q.destination,q.customer_reference,q.notes,jsonb_build_object('quote_id',q.id,'commercial_source','RFQ_QUOTE')) returning id into domain_id;
 elsif p_kind='TRANSPORT_ORDER' then
  insert into transport_orders(organization_id,order_number,order_type,status,customer_id,pickup_address,delivery_address,currency,metadata)
  values(q.organization_id,'TO-'||num,'PICKUP','DRAFT',q.customer_id,q.origin,q.destination,q.currency,jsonb_build_object('quote_id',q.id,'commercial_source','RFQ_QUOTE')) returning id into domain_id;
 elsif p_kind='WAREHOUSE_RECEIPT' then
  insert into jobs(organization_id,job_number,customer_id) values(q.organization_id,'JOB-'||num,q.customer_id) returning id into job;
  insert into warehouse_receipts(organization_id,job_id,receipt_number) values(q.organization_id,job,'WR-'||num) returning id into domain_id;
 else raise exception 'Choose Shipment, Transport Order or Warehouse Receipt';end if;
 select * into tx from transactions where organization_id=q.organization_id and transaction_type=p_kind and domain_record_id=domain_id;
 if tx.id is null then raise exception 'Operation registry was not created';end if;
 perform nodara_apply_quote_to_transaction(q.id,tx.id);
 perform set_config('nodara.creating_quote_operation','',true);
 update quotes set metadata=metadata||jsonb_build_object('created_transaction_id',tx.id),updated_at=now() where id=q.id;
 return jsonb_build_object('transaction_id',tx.id,'record_id',domain_id,'type',p_kind,'number',tx.document_number,'existing',false);
end $$;

create or replace function public.nodara_sync_commercial_event(p_transaction_id uuid,p_event text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare tx transactions%rowtype; customer uuid; sid uuid; price jsonb; metrics jsonb; v_unit text; qty numeric; amount numeric; cid uuid; n int:=0; issues jsonb:='[]'; planning boolean:=p_event='OPERATION_CREATED'; event_prefix text;
begin
 select * into tx from transactions where id=p_transaction_id for update;
 if tx.id is null or not nodara_is_org_member(tx.organization_id) then raise exception 'Operation access denied';end if;
 select entity_id into customer from transaction_parties where transaction_id=tx.id and role_code='CUSTOMER' and is_primary;
 if nullif(current_setting('nodara.creating_quote_operation',true),'') is not null then return jsonb_build_object('created',0,'reason','RFQ operation uses quoted charges');end if;
 if customer is null then return jsonb_build_object('created',0,'reason','Customer not assigned');end if;
 event_prefix:=case tx.transaction_type when 'WAREHOUSE_RECEIPT' then 'WR_' when 'CARGO_RELEASE' then 'CR_' when 'TRANSPORT_ORDER' then 'TO_' when 'SHIPMENT' then 'SHIPMENT_' else 'NONE_' end;
 metrics:=nodara_transaction_cargo_totals(tx.id);
 if not planning then
  for cid in select id from operational_charges where transaction_id=tx.id and quote_id is not null and invoice_id is null and billing_status in ('UNBILLED','READY') loop
   update operational_charges set performed_at=coalesce(performed_at,now()) where id=cid;
   perform nodara_apply_billing_policy(cid,case when tx.transaction_type='SHIPMENT' then tx.id else null end);
  end loop;
 end if;
 for sid in
  select r.service_id from customer_rate_agreements r where r.organization_id=tx.organization_id and r.customer_id=customer and r.active and r.effective_from<=current_date and (r.effective_to is null or r.effective_to>=current_date)
    and ((planning and r.is_default_service and starts_with(coalesce(r.metadata->>'billing_event',''),event_prefix)) or (not planning and r.metadata->>'billing_event'=p_event))
  union
  select r.service_id from service_agreement_billing_rules r join service_agreements a on a.id=r.agreement_id where a.organization_id=tx.organization_id and a.customer_id=customer and a.status='ACTIVE' and a.effective_from<=current_date and (a.effective_to is null or a.effective_to>=current_date) and r.active and not planning and r.trigger_event=p_event
 loop
  if exists(select 1 from operational_charges where transaction_id=tx.id and service_id=sid and quote_id is not null) then continue;end if;
  price:=nodara_resolve_commercial_rate(tx.id,sid);
  if price->>'source'='EXCEPTION' or price->>'rate' is null then issues:=issues||jsonb_build_array(jsonb_build_object('service_id',sid,'reason','No valid agreed rate'));continue;end if;
  if coalesce((price->>'included')::boolean,false) then continue;end if;
  v_unit:=upper(price->>'unit');
  qty:=case when v_unit in ('WR','CR','SHIPMENT','TO','JOB','ORDER','TRANSACTION','EA') then 1 when v_unit in ('PIECE','PCS','UNIT') then (metrics->>'handling_units')::numeric when v_unit='KG' then (metrics->>'gross_weight_kg')::numeric when v_unit='LB' then (metrics->>'gross_weight_kg')::numeric/0.45359237 when v_unit='CBM' then (metrics->>'volume_cbm')::numeric else null end;
  if v_unit in ('PALLET','SKID','CRATE','CARTON','BOX','DRUM','BAG','TOTE') then
   if tx.transaction_type='CARGO_RELEASE' then
    select sum(l.requested_quantity) into qty from cargo_release_lines l join cargo_units u on u.id=l.cargo_unit_id where l.cargo_release_id=tx.domain_record_id and upper(u.package_type)=v_unit;
   else
    select sum(c.quantity) into qty from cargo_assignments a join cargo_objects c on c.id=a.cargo_object_id where a.organization_id=tx.organization_id and a.transaction_type=tx.transaction_type and a.transaction_id=tx.domain_record_id and a.status<>'REMOVED' and upper(c.package_type)=v_unit;
   end if;
  end if;
  if qty is null or qty<=0 then issues:=issues||jsonb_build_array(jsonb_build_object('service_id',sid,'reason','Actual quantity not available','unit',v_unit));continue;end if;
  amount:=greatest(qty*(price->>'rate')::numeric,coalesce((price->>'minimum')::numeric,0));
  if price->>'maximum' is not null then amount:=least(amount,(price->>'maximum')::numeric);end if;
  select id into cid from operational_charges where transaction_id=tx.id and service_id=sid and quote_id is null and rate_source in ('CUSTOMER_AGREEMENT','SERVICE_AGREEMENT','STANDARD_RATE') order by created_at limit 1 for update;
  if cid is not null and exists(select 1 from operational_charges where id=cid and (invoice_id is not null or performed_at is not null)) then continue;end if;
  if cid is null then
   insert into operational_charges(organization_id,transaction_id,customer_id,service_id,source_type,source_id,source_event,description,quantity,unit,sell_rate,sell_amount,currency,rate_source,rate_source_id,billing_status,vendor_status,performed_at,originating_transaction_id,metadata)
   select tx.organization_id,tx.id,customer,sid,tx.transaction_type,tx.domain_record_id,p_event,s.name,qty,v_unit,(price->>'rate')::numeric,round(amount,2),price->>'currency',price->>'source',(price->>'source_id')::uuid,'UNBILLED','NOT_REQUIRED',case when planning then null else now() end,tx.id,jsonb_build_object('smart_pricing',true,'rate_snapshot',price,'quantity_snapshot',metrics) from service_catalog s where s.id=sid returning id into cid;
   n:=n+1;
  else
   update operational_charges set quantity=qty,sell_rate=(price->>'rate')::numeric,sell_amount=round(amount,2),unit=v_unit,currency=price->>'currency',rate_source=price->>'source',rate_source_id=(price->>'source_id')::uuid,performed_at=case when planning then performed_at else coalesce(performed_at,now()) end,metadata=metadata||jsonb_build_object('smart_pricing',true,'rate_snapshot',price,'quantity_snapshot',metrics),updated_at=now() where id=cid;
  end if;
  if not planning then perform nodara_apply_billing_policy(cid,case when tx.transaction_type='SHIPMENT' then tx.id else null end);end if;
 end loop;
 update transactions set metadata=metadata||jsonb_build_object('commercial_pricing',jsonb_build_object('event',p_event,'issues',issues,'calculated_at',now())) where id=tx.id;
 return jsonb_build_object('created',n,'issues',issues);
end $$;

create or replace function public.nodara_commercial_status_event()
returns trigger language plpgsql security invoker set search_path=public as $$
declare event text;
begin
 if upper(coalesce(new.status_projection,'')) in ('RECEIVED','RELEASED','DELIVERED','COMPLETED','COMPLETE','CLOSED') then
  event:=case new.transaction_type when 'WAREHOUSE_RECEIPT' then 'WR_RECEIVED' when 'CARGO_RELEASE' then 'CR_RELEASED' when 'TRANSPORT_ORDER' then 'TO_DELIVERED' when 'SHIPMENT' then 'SHIPMENT_DELIVERED' end;
  if event is not null then perform nodara_sync_commercial_event(new.id,event);end if;
 end if;
 return new;
end $$;
create trigger nodara_commercial_status_event after update of status_projection on public.transactions for each row when(old.status_projection is distinct from new.status_projection) execute function public.nodara_commercial_status_event();

create or replace function public.nodara_commercial_customer_event()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.role_code='CUSTOMER' and new.is_primary then perform nodara_sync_commercial_event(new.transaction_id,'OPERATION_CREATED');end if;
 return new;
end $$;
create trigger nodara_commercial_customer_event after insert or update of entity_id on public.transaction_parties for each row execute function public.nodara_commercial_customer_event();

create or replace function public.nodara_commercial_cargo_event()
returns trigger language plpgsql security invoker set search_path=public as $$
declare txid uuid;
begin
 select id into txid from transactions where organization_id=new.organization_id and transaction_type=new.transaction_type and domain_record_id=new.transaction_id;
 if txid is not null then perform nodara_sync_commercial_event(txid,'OPERATION_CREATED');end if;
 return new;
end $$;
create trigger nodara_commercial_cargo_event after insert or update on public.cargo_assignments for each row execute function public.nodara_commercial_cargo_event();

revoke all on function public.nodara_resolve_commercial_rate(uuid,uuid,date),public.nodara_create_operation_from_quote(uuid,text),public.nodara_sync_commercial_event(uuid,text) from public,anon;
grant execute on function public.nodara_resolve_commercial_rate(uuid,uuid,date),public.nodara_create_operation_from_quote(uuid,text),public.nodara_sync_commercial_event(uuid,text) to authenticated;
notify pgrst,'reload schema';

create or replace function public.nodara_apply_billing_policy(p_charge_id uuid,p_shipment_transaction_id uuid default null)
returns public.operational_charges language plpgsql security invoker set search_path=public as $$
declare c operational_charges%rowtype;p customer_billing_policies%rowtype;bt transactions%rowtype;v_billable timestamptz;v_group text;
begin
 select * into c from operational_charges where id=p_charge_id;
 if c.id is null then raise exception 'Charge not found';end if;
 if not nodara_is_org_member(c.organization_id) then raise exception 'Workspace access denied';end if;
 select * into p from customer_billing_policies where organization_id=c.organization_id and customer_id=c.customer_id and active and effective_from<=current_date and (effective_to is null or effective_to>=current_date) order by effective_from desc limit 1;
 if p.id is null then
   update operational_charges set billing_mode='IMMEDIATE',billable_at=c.performed_at,billing_group_key=coalesce(billing_group_key,'IMMEDIATE:'||c.customer_id::text) where id=c.id returning * into c;return c;
 end if;
 if c.performed_at is null then update operational_charges set billing_mode=p.billing_mode,billing_policy_id=p.id,billable_at=null where id=c.id returning * into c;return c;end if;
 if p.billing_mode='IMMEDIATE' then v_billable:=c.performed_at;v_group:='IMMEDIATE:'||c.customer_id::text;
 elsif p.billing_mode='PERIODIC' then
   v_billable:=case p.cadence when 'DAILY' then date_trunc('day',c.performed_at)+interval '1 day'
    when 'WEEKLY' then date_trunc('week',c.performed_at)+interval '1 week'
    when 'SEMIMONTHLY' then case when extract(day from c.performed_at)<=15 then date_trunc('month',c.performed_at)+interval '15 day' else date_trunc('month',c.performed_at)+interval '1 month' end
    else date_trunc('month',c.performed_at)+interval '1 month' end;
   v_group:='PERIODIC:'||c.customer_id::text||':'||to_char(v_billable,'YYYY-MM-DD');
 elsif p.billing_mode='SHIPMENT' then
   if p_shipment_transaction_id is not null then select * into bt from transactions where id=p_shipment_transaction_id and organization_id=c.organization_id and transaction_type='SHIPMENT';if bt.id is null then raise exception 'Shipment billing target is invalid';end if;end if;
   v_billable:=case when bt.id is not null then now() else null end;v_group:=case when bt.id is not null then 'SHIPMENT:'||bt.id::text else 'SHIPMENT:UNASSIGNED:'||c.customer_id::text end;
 else v_billable:=null;v_group:='MANUAL:'||c.customer_id::text;end if;
 update operational_charges set billing_policy_id=p.id,billing_mode=p.billing_mode,billable_at=v_billable,billing_group_key=v_group,bill_on_transaction_id=coalesce(bt.id,bill_on_transaction_id),transferred_at=case when bt.id is not null then now() else transferred_at end,margin_amount=coalesce(sell_amount,0)-coalesce(buy_amount,estimated_buy_amount,0) where id=c.id returning * into c;return c;
end $$;
notify pgrst,'reload schema';
