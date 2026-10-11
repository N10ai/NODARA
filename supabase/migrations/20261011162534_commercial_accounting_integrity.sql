-- Validate native payment allocations and serialize invoice creation.

create or replace function public.nodara_post_customer_payment(p_organization_id uuid,p_customer_id uuid,p_amount numeric,p_currency text,p_method text,p_reference text,p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare pid uuid;pno text;a jsonb;remaining numeric:=p_amount;i customer_invoices%rowtype;amt numeric;
begin if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Payment must be positive';end if;
 if not exists(select 1 from entities where id=p_customer_id and organization_id=p_organization_id) then raise exception 'Payment party is outside this workspace';end if;
 pno:='RCPT-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into customer_payments(organization_id,customer_id,payment_number,amount,currency,method,reference) values(p_organization_id,p_customer_id,pno,p_amount,coalesce(p_currency,'USD'),p_method,p_reference) returning id into pid;
 for a in select * from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop amt:=(a->>'amount')::numeric;select * into i from customer_invoices where id=(a->>'invoice_id')::uuid and organization_id=p_organization_id and customer_id=p_customer_id for update;if i.id is null or i.status not in('ISSUED','PARTIALLY_PAID') then raise exception 'Invalid invoice allocation';end if;if i.currency<>coalesce(p_currency,'USD') then raise exception 'Payment currency must match the allocated record';end if;if amt is null or amt<>round(amt,2) or amt<=0 or amt>i.balance or amt>remaining then raise exception 'Invalid allocation amount';end if;
 insert into customer_payment_allocations(organization_id,payment_id,invoice_id,amount) values(p_organization_id,pid,i.id,amt);update customer_invoices set balance=balance-amt,status=case when balance-amt<=0 then 'PAID' else 'PARTIALLY_PAID' end,updated_at=now() where id=i.id;remaining:=remaining-amt;end loop;return pid;end $$;

create or replace function public.nodara_post_vendor_payment(p_organization_id uuid,p_vendor_id uuid,p_amount numeric,p_currency text,p_method text,p_reference text,p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare pid uuid;pno text;a jsonb;remaining numeric:=p_amount;b vendor_bills%rowtype;amt numeric;
begin if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Payment must be positive';end if;
 if not exists(select 1 from entities where id=p_vendor_id and organization_id=p_organization_id) then raise exception 'Payment party is outside this workspace';end if;
 pno:='PAY-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into vendor_payments(organization_id,vendor_id,payment_number,amount,currency,method,reference) values(p_organization_id,p_vendor_id,pno,p_amount,coalesce(p_currency,'USD'),p_method,p_reference) returning id into pid;
 for a in select * from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop amt:=(a->>'amount')::numeric;select * into b from vendor_bills where id=(a->>'bill_id')::uuid and organization_id=p_organization_id and vendor_id=p_vendor_id for update;if b.id is null or b.status not in('APPROVED','PARTIALLY_PAID') then raise exception 'Invalid vendor bill allocation';end if;if b.currency<>coalesce(p_currency,'USD') then raise exception 'Payment currency must match the allocated record';end if;if amt is null or amt<>round(amt,2) or amt<=0 or amt>b.balance or amt>remaining then raise exception 'Invalid allocation amount';end if;
 insert into vendor_payment_allocations(organization_id,payment_id,bill_id,amount) values(p_organization_id,pid,b.id,amt);update vendor_bills set balance=balance-amt,status=case when balance-amt<=0 then 'PAID' else 'PARTIALLY_PAID' end,updated_at=now() where id=b.id;remaining:=remaining-amt;end loop;return pid;end $$;

create or replace function public.nodara_create_invoice_from_charges(p_organization_id uuid,p_customer_id uuid,p_charge_ids uuid[],p_invoice_date date default current_date,p_terms_days int default 30)
returns uuid language plpgsql security invoker set search_path=public as $$
declare iid uuid;ino text;sub numeric;cur text;cnt int;
begin
 if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;
 perform 1 from operational_charges where organization_id=p_organization_id and id=any(p_charge_ids) order by id for update;
 select count(*),coalesce(sum(sell_amount),0),min(currency) into cnt,sub,cur from operational_charges where organization_id=p_organization_id and customer_id=p_customer_id and id=any(p_charge_ids) and billing_status in('UNBILLED','READY') and invoice_id is null and coalesce(billable_at,performed_at,created_at)<=now();
 if cnt<>cardinality(p_charge_ids) or cnt=0 then raise exception 'One or more charges are not invoice-ready';end if;
 if exists(select 1 from operational_charges where organization_id=p_organization_id and customer_id=p_customer_id and id=any(p_charge_ids) having count(distinct currency)>1) then raise exception 'An invoice cannot mix currencies';end if;
 ino:='INV-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into customer_invoices(organization_id,invoice_number,customer_id,status,invoice_date,due_date,currency,subtotal,total,balance,terms_days,source_snapshot)
 values(p_organization_id,ino,p_customer_id,'DRAFT',p_invoice_date,p_invoice_date+greatest(p_terms_days,0),coalesce(cur,'USD'),sub,sub,sub,greatest(p_terms_days,0),jsonb_build_object('charge_ids',p_charge_ids,'created_from','OPERATIONAL_CHARGES')) returning id into iid;
 insert into customer_invoice_lines(organization_id,invoice_id,charge_id,description,quantity,unit,rate,amount,source_label,service_date,metadata)
 select p_organization_id,iid,id,description,quantity,unit,sell_rate,sell_amount,coalesce(source_type,'SERVICE'),coalesce(performed_at,created_at)::date,jsonb_build_object('originating_transaction_id',originating_transaction_id,'bill_on_transaction_id',bill_on_transaction_id,'rate_source',rate_source,'quote_id',quote_id)
 from operational_charges where organization_id=p_organization_id and id=any(p_charge_ids);
 update operational_charges set invoice_id=iid,billing_status='BILLED' where organization_id=p_organization_id and id=any(p_charge_ids);
 return iid;
end $$;

create or replace function public.nodara_void_invoice(p_invoice_id uuid,p_reason text)
returns public.customer_invoices language plpgsql security invoker set search_path=public as $$
declare i customer_invoices%rowtype;
begin select * into i from customer_invoices where id=p_invoice_id for update;if i.id is null then raise exception 'Invoice not found';end if;if not nodara_is_org_member(i.organization_id) then raise exception 'Workspace access denied';end if;
 if i.status in ('PAID','PARTIALLY_PAID') or exists(select 1 from customer_payment_allocations where invoice_id=i.id) then raise exception 'Paid invoice cannot be voided; use a financial adjustment';end if;if coalesce(trim(p_reason),'')='' then raise exception 'Void reason is required';end if;
 update operational_charges set invoice_id=null,billing_status='READY' where invoice_id=i.id;
 update customer_invoices set status='VOID',voided_at=now(),void_reason=p_reason,balance=0,updated_at=now() where id=i.id returning * into i;return i;end $$;

create or replace function public.nodara_set_quote_status(p_quote_id uuid,p_status text)
returns public.quotes language plpgsql security invoker set search_path=public as $$
declare q quotes%rowtype;
begin
 select * into q from quotes where id=p_quote_id for update;
 if q.id is null or not nodara_is_org_member(q.organization_id) then raise exception 'Quote not found in this workspace';end if;
 if not ((q.status='DRAFT' and p_status in ('SENT','CANCELLED')) or (q.status='SENT' and p_status in ('ACCEPTED','DECLINED','CANCELLED'))) then raise exception 'Invalid quote status transition';end if;
 if p_status in ('SENT','ACCEPTED') then
  if q.valid_to is not null and q.valid_to<current_date then raise exception 'The quote has expired';end if;
  if not exists(select 1 from quote_lines where quote_id=q.id) then raise exception 'Add quote services before changing status';end if;
 end if;
 update quotes set status=p_status,accepted_at=case when p_status='ACCEPTED' then now() else accepted_at end,accepted_by=case when p_status='ACCEPTED' then auth.uid() else accepted_by end,updated_at=now() where id=q.id returning * into q;
 return q;
end $$;
revoke all on function public.nodara_set_quote_status(uuid,text) from public,anon;
grant execute on function public.nodara_set_quote_status(uuid,text) to authenticated;
notify pgrst,'reload schema';

create or replace function public.nodara_save_quote(p_quote jsonb,p_lines jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare q quotes%rowtype; incoming quotes%rowtype; qid uuid; sell numeric; buy numeric;
begin
 incoming:=jsonb_populate_record(null::quotes,p_quote);
 if not nodara_is_org_member(incoming.organization_id) then raise exception 'Workspace access denied';end if;
 if not exists(select 1 from entities where id=incoming.customer_id and organization_id=incoming.organization_id) then raise exception 'Choose a customer in this workspace';end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Add quote services';end if;
 if exists(select 1 from jsonb_to_recordset(p_lines) as l(quantity numeric,sell_rate numeric,estimated_buy_rate numeric,service_id uuid,currency text) where quantity is null or quantity<=0 or sell_rate is null or sell_rate<0 or estimated_buy_rate<0 or coalesce(currency,'USD')<>incoming.currency or (service_id is not null and not exists(select 1 from service_catalog where id=service_id and organization_id=incoming.organization_id))) then raise exception 'Invalid quote quantities, rates, currency or service';end if;
 select sum(greatest(quantity*sell_rate,coalesce(minimum_charge,0))),sum(quantity*coalesce(estimated_buy_rate,0)) into sell,buy from jsonb_to_recordset(p_lines) as l(quantity numeric,sell_rate numeric,minimum_charge numeric,estimated_buy_rate numeric);
 if incoming.id is not null then
  select * into q from quotes where id=incoming.id and organization_id=incoming.organization_id for update;
  if q.id is null or q.status<>'DRAFT' then raise exception 'Only draft quotes can be edited';end if;
  qid:=q.id;
  update quotes set customer_id=incoming.customer_id,mode=incoming.mode,origin=incoming.origin,destination=incoming.destination,currency=incoming.currency,valid_to=incoming.valid_to,notes=incoming.notes,subtotal=round(sell,2),estimated_cost=round(buy,2),gross_profit=round(sell-buy,2),margin_percent=case when sell=0 then 0 else (sell-buy)/sell*100 end,updated_at=now() where id=qid;
  delete from quote_lines where quote_id=qid;
 else
  insert into quotes(organization_id,quote_number,customer_id,mode,origin,destination,currency,valid_to,notes,subtotal,estimated_cost,gross_profit,margin_percent)
  values(incoming.organization_id,'Q-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),incoming.customer_id,incoming.mode,incoming.origin,incoming.destination,incoming.currency,incoming.valid_to,incoming.notes,round(sell,2),round(buy,2),round(sell-buy,2),case when sell=0 then 0 else (sell-buy)/sell*100 end) returning id into qid;
 end if;
 insert into quote_lines(organization_id,quote_id,sort_order,service_id,description,quantity,unit,sell_rate,minimum_charge,sell_amount,estimated_buy_rate,estimated_buy_amount,currency,rate_source,rate_source_id,rate_snapshot,show_on_awb,awb_charge_bucket)
 select incoming.organization_id,qid,coalesce(l.sort_order,100),l.service_id,coalesce(nullif(trim(l.description),''),'Service'),l.quantity,coalesce(l.unit,'EA'),l.sell_rate,l.minimum_charge,round(greatest(l.quantity*l.sell_rate,coalesce(l.minimum_charge,0)),2),l.estimated_buy_rate,round(l.quantity*coalesce(l.estimated_buy_rate,0),2),incoming.currency,coalesce(l.rate_source,'MANUAL'),l.rate_source_id,coalesce(l.rate_snapshot,'{}'::jsonb),coalesce(l.show_on_awb,false),l.awb_charge_bucket
 from jsonb_to_recordset(p_lines) as l(sort_order int,service_id uuid,description text,quantity numeric,unit text,sell_rate numeric,minimum_charge numeric,estimated_buy_rate numeric,rate_source text,rate_source_id uuid,rate_snapshot jsonb,show_on_awb boolean,awb_charge_bucket text);
 return qid;
end $$;
revoke all on function public.nodara_save_quote(jsonb,jsonb) from public,anon;
grant execute on function public.nodara_save_quote(jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
