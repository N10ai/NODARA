-- Uses an existing operation only as a reference; fixtures and changes all roll back.
begin;
do $$
declare tx transactions%rowtype; member uuid; customer uuid; quote uuid; other_quote uuid; invoice uuid; charge uuid; other_customer uuid; euro_charge uuid; n int; rejected boolean;
begin
 select t.* into tx from transactions t join transaction_parties p on p.transaction_id=t.id and p.role_code='CUSTOMER' and p.is_primary
 join organization_members m on m.organization_id=t.organization_id
 where t.transaction_type in ('WAREHOUSE_RECEIPT','CARGO_RELEASE','SHIPMENT','TRANSPORT_ORDER') and upper(coalesce(t.status_projection,'')) not in ('VOID','VOIDED','CANCELLED','CANCELED','DELETED') limit 1;
 if tx.id is null then raise exception 'Test needs an active customer operation';end if;
 select user_id into member from organization_members where organization_id=tx.organization_id limit 1;
 perform set_config('request.jwt.claim.sub',member::text,true);
 select entity_id into customer from transaction_parties where transaction_id=tx.id and role_code='CUSTOMER' and is_primary;
 quote:=nodara_save_quote(jsonb_build_object('organization_id',tx.organization_id,'customer_id',customer,'currency','USD'),jsonb_build_array(jsonb_build_object('description','Rollback pipeline service','quantity',2,'sell_rate',25,'currency','USD')));
 rejected:=false;begin perform nodara_apply_quote_to_transaction(quote,tx.id);exception when others then rejected:=true;end;
 assert rejected,'Draft quote was applied';
 perform nodara_set_quote_status(quote,'SENT');perform nodara_set_quote_status(quote,'ACCEPTED');
 assert exists(select 1 from nodara_quote_operation_candidates(quote) where transaction_id=tx.id),'Customer operation not listed';
 insert into entities(organization_id,name,roles) values(tx.organization_id,'Rollback wrong customer',array['customer']) returning id into other_customer;
 other_quote:=nodara_save_quote(jsonb_build_object('organization_id',tx.organization_id,'customer_id',other_customer,'currency','USD'),jsonb_build_array(jsonb_build_object('description','Wrong customer test','quantity',1,'sell_rate',25,'currency','USD')));
 perform nodara_set_quote_status(other_quote,'SENT');perform nodara_set_quote_status(other_quote,'ACCEPTED');
 rejected:=false;begin perform nodara_apply_quote_to_transaction(other_quote,tx.id);exception when others then rejected:=true;end;
 assert rejected,'Wrong customer quote applied';
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;begin perform nodara_apply_quote_to_transaction(quote,tx.id);exception when others then rejected:=true;end;
 assert rejected,'Unauthenticated quote application accepted';
 perform set_config('request.jwt.claim.sub',member::text,true);
 n:=nodara_apply_quote_to_transaction(quote,tx.id);assert n=1,'Expected one charge';
 n:=nodara_apply_quote_to_transaction(quote,tx.id);assert n=0,'Retry created duplicate charges';
 select id into charge from operational_charges where quote_id=quote;
 assert (select count(*)=1 from operational_charges where quote_id=quote),'Duplicate charge';
 assert not exists(select 1 from nodara_invoice_ready_charges(tx.organization_id,customer) where charge_id=charge),'Unperformed quoted charge became invoice-ready';
 rejected:=false;begin perform nodara_create_invoice_from_charges(tx.organization_id,customer,array[charge]);exception when others then rejected:=true;end;
 assert rejected,'Held charge invoiced';
 rejected:=false;begin perform nodara_approve_charge_for_billing(charge,'Test',false);exception when others then rejected:=true;end;
 assert rejected,'Unperformed service approved without confirmation';
 perform nodara_approve_charge_for_billing(charge,'Service verified for rollback test',true);
 update operational_charges set billable_at=now()+interval '1 day' where id=charge;
 assert not exists(select 1 from nodara_invoice_ready_charges(tx.organization_id,customer) where charge_id=charge),'Future charge became ready';
 rejected:=false;begin perform nodara_create_invoice_from_charges(tx.organization_id,customer,array[charge]);exception when others then rejected:=true;end;
 assert rejected,'Future charge invoiced';
 perform nodara_approve_charge_for_billing(charge,'Release confirmed for rollback test',true);
 assert exists(select 1 from nodara_invoice_ready_charges(tx.organization_id,customer) where charge_id=charge),'Approved charge missing from queue';
 insert into operational_charges(organization_id,customer_id,source_type,source_id,description,quantity,unit,sell_rate,sell_amount,currency,transaction_id,billing_status,vendor_status,performed_at,billable_at)
 values(tx.organization_id,customer,tx.transaction_type,tx.domain_record_id,'Rollback EUR service',1,'EA',10,10,'EUR',tx.id,'READY','NOT_REQUIRED',now(),now()) returning id into euro_charge;
 rejected:=false;begin perform nodara_create_invoice_from_charges(tx.organization_id,customer,array[charge,euro_charge]);exception when others then rejected:=true;end;
 assert rejected,'Mixed currency invoice accepted';
 assert (select invoice_id is null from operational_charges where id=charge),'Failed mixed-currency invoice claimed charge';
 invoice:=nodara_create_invoice_from_charges(tx.organization_id,customer,array[charge],current_date,30);
 assert (select total=50 and status='DRAFT' from customer_invoices where id=invoice),'Incorrect draft invoice';
 assert (select invoice_id=invoice from operational_charges where id=charge),'Invoice source charge not linked';
 rejected:=false;begin perform nodara_create_invoice_from_charges(tx.organization_id,customer,array[charge]);exception when others then rejected:=true;end;
 assert rejected,'Charge invoiced twice';
 perform nodara_issue_invoice(invoice);
 perform nodara_post_customer_payment(tx.organization_id,customer,50,'USD','ACH','ROLLBACK TEST',jsonb_build_array(jsonb_build_object('invoice_id',invoice,'amount',50)));
 assert (select balance=0 and status='PAID' from customer_invoices where id=invoice),'Invoice did not settle';
end $$;
rollback;
