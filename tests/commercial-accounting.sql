-- Run as a database test owner. All fixtures and changes roll back.
begin;
do $$
declare org uuid; member uuid; party uuid; invoice uuid; bill uuid; quote uuid; rejected boolean; before_count int;
begin
 select organization_id,user_id into org,member from organization_members limit 1;
 if org is null then raise exception 'Test requires an organization member';end if;
 perform set_config('request.jwt.claim.sub',member::text,true);
 insert into entities(organization_id,name,roles) values(org,'NODARA rollback test',array['customer','vendor']) returning id into party;
 quote:=nodara_save_quote(jsonb_build_object('organization_id',org,'customer_id',party,'currency','USD'),jsonb_build_array(jsonb_build_object('quantity',2,'sell_rate',25,'estimated_buy_rate',10,'description','Test service','currency','USD')));
 assert (select subtotal=50 and gross_profit=30 from quotes where id=quote),'Quote totals incorrect';
 rejected:=false;
 begin perform nodara_save_quote(jsonb_build_object('id',quote,'organization_id',org,'customer_id',party,'currency','USD'),jsonb_build_array(jsonb_build_object('quantity',0,'sell_rate',25,'currency','USD')));exception when others then rejected:=true;end;
 assert rejected,'Invalid quote save accepted';
 assert (select count(*)=1 from quote_lines where quote_id=quote),'Invalid save destroyed quote lines';
 perform nodara_set_quote_status(quote,'SENT');perform nodara_set_quote_status(quote,'ACCEPTED');
 rejected:=false;begin perform nodara_set_quote_status(quote,'SENT');exception when others then rejected:=true;end;
 assert rejected,'Accepted quote returned to sent';
 insert into customer_invoices(organization_id,customer_id,invoice_number,status,currency,total,balance) values(org,party,'TEST-'||gen_random_uuid(),'ISSUED','USD',100,100) returning id into invoice;
 perform nodara_post_customer_payment(org,party,40,'USD','ACH','TEST',jsonb_build_array(jsonb_build_object('invoice_id',invoice,'amount',40)));
 assert (select balance=60 and status='PARTIALLY_PAID' from customer_invoices where id=invoice),'Partial payment incorrect';
 select count(*) into before_count from customer_payments where customer_id=party;
 rejected:=false;begin perform nodara_post_customer_payment(org,party,10,'EUR','ACH','TEST',jsonb_build_array(jsonb_build_object('invoice_id',invoice,'amount',10)));exception when others then rejected:=true;end;
 assert rejected,'Currency mismatch accepted';
 assert (select count(*)=before_count from customer_payments where customer_id=party),'Rejected payment was stored';
 rejected:=false;begin perform nodara_void_invoice(invoice,'Test');exception when others then rejected:=true;end;
 assert rejected,'Partially paid invoice voided';
 rejected:=false;begin perform nodara_post_customer_payment(org,party,61,'USD','ACH','TEST',jsonb_build_array(jsonb_build_object('invoice_id',invoice,'amount',61)));exception when others then rejected:=true;end;
 assert rejected,'Overpayment accepted';
 perform nodara_post_customer_payment(org,party,60,'USD','ACH','TEST',jsonb_build_array(jsonb_build_object('invoice_id',invoice,'amount',60)));
 assert (select balance=0 and status='PAID' from customer_invoices where id=invoice),'Full payment incorrect';
 insert into vendor_bills(organization_id,vendor_id,bill_number,status,currency,total,balance) values(org,party,'TEST-'||gen_random_uuid(),'APPROVED','USD',75,75) returning id into bill;
 perform nodara_post_vendor_payment(org,party,25,'USD','WIRE','TEST',jsonb_build_array(jsonb_build_object('bill_id',bill,'amount',25)));
 assert (select balance=50 and status='PARTIALLY_PAID' from vendor_bills where id=bill),'Vendor partial payment incorrect';
 perform nodara_post_vendor_payment(org,party,50,'USD','WIRE','TEST',jsonb_build_array(jsonb_build_object('bill_id',bill,'amount',50)));
 assert (select balance=0 and status='PAID' from vendor_bills where id=bill),'Vendor settlement incorrect';
end $$;
rollback;
