-- Accepted quote snapshots feed canonical operations; billing eligibility is explicit.
create or replace function public.nodara_quote_operation_candidates(p_quote_id uuid)
returns table(transaction_id uuid,transaction_type text,document_number text,status text,already_linked boolean)
language sql stable security invoker set search_path=public as $$
 select t.id,t.transaction_type,t.document_number,t.status_projection,
 exists(select 1 from quote_transaction_links ql where ql.quote_id=q.id and ql.transaction_id=t.id)
 from quotes q join transactions t on t.organization_id=q.organization_id
 where q.id=p_quote_id and nodara_is_org_member(q.organization_id) and q.status='ACCEPTED'
 and t.transaction_type in ('WAREHOUSE_RECEIPT','CARGO_RELEASE','SHIPMENT','TRANSPORT_ORDER')
 and upper(coalesce(t.status_projection,'')) not in ('VOID','VOIDED','CANCELLED','CANCELED','DELETED')
 and exists(select 1 from transaction_parties p where p.transaction_id=t.id and p.organization_id=q.organization_id and p.role_code='CUSTOMER' and p.entity_id=q.customer_id and p.is_primary)
 order by t.updated_at desc;
$$;

create or replace function public.nodara_apply_quote_to_transaction(p_quote_id uuid,p_transaction_id uuid)
returns integer language plpgsql security invoker set search_path=public as $$
declare q quotes%rowtype; tx transactions%rowtype; l quote_lines%rowtype; n int:=0; cid uuid;
begin
 select * into q from quotes where id=p_quote_id for update;
 select * into tx from transactions where id=p_transaction_id for update;
 if q.id is null or tx.id is null or q.organization_id<>tx.organization_id or not nodara_is_org_member(q.organization_id) then raise exception 'Quote / operation workspace mismatch';end if;
 if q.status<>'ACCEPTED' then raise exception 'Accept the quote before applying it to an operation';end if;
 if not exists(select 1 from nodara_quote_operation_candidates(q.id) where transaction_id=tx.id) then raise exception 'Choose an active operation for the quoted customer';end if;
 if not exists(select 1 from quote_lines where quote_id=q.id and invoiceable) then raise exception 'Quote has no billable services';end if;
 insert into quote_transaction_links(organization_id,quote_id,transaction_id) values(q.organization_id,q.id,tx.id) on conflict do nothing;
 for l in select * from quote_lines where quote_id=q.id and invoiceable order by sort_order loop
  cid:=null;
  insert into operational_charges(organization_id,transaction_id,customer_id,service_id,source_type,source_id,source_event,description,quantity,unit,sell_rate,sell_amount,estimated_buy_rate,estimated_buy_amount,currency,rate_source,rate_source_id,billing_status,vendor_status,quote_id,quote_line_id,show_on_awb,awb_charge_bucket,originating_transaction_id,provenance,metadata,billing_mode,billing_group_key)
  values(q.organization_id,tx.id,q.customer_id,l.service_id,tx.transaction_type,tx.domain_record_id,'QUOTE_APPLIED',l.description,l.quantity,l.unit,l.sell_rate,l.sell_amount,l.estimated_buy_rate,l.estimated_buy_amount,l.currency,'QUOTE_SNAPSHOT',l.id,'UNBILLED','NOT_REQUIRED',q.id,l.id,l.show_on_awb,l.awb_charge_bucket,tx.id,jsonb_build_object('quote_id',q.id,'quote_line_id',l.id,'applied_by',auth.uid()),jsonb_build_object('rate_snapshot',l.rate_snapshot),'MANUAL','OPERATION:'||tx.id::text)
  on conflict(transaction_id,quote_line_id) where quote_line_id is not null do nothing returning id into cid;
  if cid is not null then n:=n+1;end if;
 end loop;
 return n;
end $$;

create or replace function public.nodara_approve_charge_for_billing(p_charge_id uuid,p_reason text,p_confirm_performed boolean default false)
returns public.operational_charges language plpgsql security invoker set search_path=public as $$
declare c operational_charges%rowtype; tx transactions%rowtype;
begin
 select * into c from operational_charges where id=p_charge_id for update;
 if c.id is null or not nodara_is_org_member(c.organization_id) then raise exception 'Charge not found in this workspace';end if;
 if c.invoice_id is not null or c.billing_status not in ('UNBILLED','READY') then raise exception 'Charge is already billed or cannot be released';end if;
 if coalesce(trim(p_reason),'')='' then raise exception 'Approval note is required';end if;
 if c.customer_id is null then raise exception 'Assign a customer before approving billing';end if;
 if c.performed_at is null and not coalesce(p_confirm_performed,false) then raise exception 'Confirm the service has been performed before billing';end if;
 if c.transaction_id is not null then
  select * into tx from transactions where id=c.transaction_id and organization_id=c.organization_id;
  if tx.id is null or upper(coalesce(tx.status_projection,'')) in ('VOID','VOIDED','CANCELLED','CANCELED','DELETED') then raise exception 'Cannot bill an inactive operation';end if;
 end if;
 update operational_charges set billing_status='READY',performed_at=coalesce(performed_at,now()),billable_at=now(),billing_mode='MANUAL',billing_group_key=coalesce(billing_group_key,'CUSTOMER:'||customer_id::text),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('billing_approval',jsonb_build_object('user_id',auth.uid(),'approved_at',now(),'note',trim(p_reason),'confirmed_performed',p_confirm_performed)),updated_at=now() where id=c.id returning * into c;
 return c;
end $$;

create or replace function public.nodara_invoice_ready_charges(p_organization_id uuid,p_customer_id uuid default null)
returns table(charge_id uuid,customer_id uuid,customer_name text,description text,quantity numeric,unit text,rate numeric,amount numeric,currency text,source_type text,source_id uuid,performed_at timestamptz,billing_mode text,billing_group_key text)
language sql stable security invoker set search_path=public as $$
 select c.id,c.customer_id,e.name,c.description,c.quantity,c.unit,c.sell_rate,c.sell_amount,c.currency,c.source_type,c.source_id,c.performed_at,c.billing_mode,c.billing_group_key
 from operational_charges c join entities e on e.id=c.customer_id and e.organization_id=c.organization_id
 left join transactions t on t.id=c.transaction_id and t.organization_id=c.organization_id
 where c.organization_id=p_organization_id and nodara_is_org_member(p_organization_id)
 and c.billing_status in ('UNBILLED','READY') and c.invoice_id is null and c.billable_at is not null and c.billable_at<=now()
 and (p_customer_id is null or c.customer_id=p_customer_id)
 and (c.transaction_id is null or (t.id is not null and upper(coalesce(t.status_projection,'')) not in ('VOID','VOIDED','CANCELLED','CANCELED','DELETED')))
 order by e.name,c.billing_group_key,c.performed_at,c.created_at;
$$;

revoke all on function public.nodara_quote_operation_candidates(uuid) from public,anon;
revoke all on function public.nodara_apply_quote_to_transaction(uuid,uuid) from public,anon;
revoke all on function public.nodara_approve_charge_for_billing(uuid,text,boolean) from public,anon;
revoke all on function public.nodara_invoice_ready_charges(uuid,uuid) from public,anon;
grant execute on function public.nodara_quote_operation_candidates(uuid),public.nodara_apply_quote_to_transaction(uuid,uuid),public.nodara_approve_charge_for_billing(uuid,text,boolean),public.nodara_invoice_ready_charges(uuid,uuid) to authenticated;

create or replace function public.nodara_create_invoice_from_charges(p_organization_id uuid,p_customer_id uuid,p_charge_ids uuid[],p_invoice_date date default current_date,p_terms_days int default 30)
returns uuid language plpgsql security invoker set search_path=public as $$
declare iid uuid;ino text;sub numeric;cur text;cnt int;
begin
 if not nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;
 perform 1 from operational_charges where organization_id=p_organization_id and id=any(p_charge_ids) order by id for update;
 select count(*),coalesce(sum(sell_amount),0),min(currency) into cnt,sub,cur from operational_charges where organization_id=p_organization_id and customer_id=p_customer_id and id=any(p_charge_ids) and billing_status in('UNBILLED','READY') and invoice_id is null and billable_at is not null and billable_at<=now() and (transaction_id is null or exists(select 1 from transactions t where t.id=transaction_id and t.organization_id=p_organization_id and upper(coalesce(t.status_projection,'')) not in ('VOID','VOIDED','CANCELLED','CANCELED','DELETED')));
 if cnt<>cardinality(p_charge_ids) or cnt=0 then raise exception 'One or more charges are not invoice-ready';end if;
 if exists(select 1 from operational_charges where organization_id=p_organization_id and customer_id=p_customer_id and id=any(p_charge_ids) having count(distinct currency)>1) then raise exception 'An invoice cannot mix currencies';end if;
 ino:='INV-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into customer_invoices(organization_id,invoice_number,customer_id,status,invoice_date,due_date,currency,subtotal,total,balance,terms_days,source_snapshot)
 values(p_organization_id,ino,p_customer_id,'DRAFT',p_invoice_date,p_invoice_date+greatest(p_terms_days,0),coalesce(cur,'USD'),sub,sub,sub,greatest(p_terms_days,0),jsonb_build_object('charge_ids',p_charge_ids,'created_from','OPERATIONAL_CHARGES')) returning id into iid;
 insert into customer_invoice_lines(organization_id,invoice_id,charge_id,description,quantity,unit,rate,amount,source_label,service_date,metadata)
 select p_organization_id,iid,id,description,quantity,unit,sell_rate,sell_amount,coalesce(source_type,'SERVICE'),coalesce(performed_at,created_at)::date,jsonb_build_object('originating_transaction_id',originating_transaction_id,'bill_on_transaction_id',bill_on_transaction_id,'rate_source',rate_source,'quote_id',quote_id)
 from operational_charges where organization_id=p_organization_id and id=any(p_charge_ids);
 update operational_charges set invoice_id=iid,billing_status='INVOICED' where organization_id=p_organization_id and id=any(p_charge_ids);
 return iid;
end $$;
notify pgrst,'reload schema';
