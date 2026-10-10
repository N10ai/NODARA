begin;
do $$ declare definition text; begin
 select pg_get_functiondef('public.nodara_guard_inbox_request()'::regprocedure) into definition;
 definition:=replace(definition,' or new.request_type<>old.request_type','');
 execute definition;
end $$;
create or replace function public.nodara_create_operations_request(p_org uuid,p_input jsonb,p_id uuid,p_message_id uuid default null) returns public.operations_requests language plpgsql security invoker set search_path=public as $$
declare r public.operations_requests; kind text:=p_input->>'request_type'; no text; tx uuid; sh uuid; customer uuid:=nullif(p_input->>'customer_id','')::uuid;
begin
 if not public.nodara_is_org_member(p_org) then raise exception 'Workspace access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.operations_requests where id=p_id and organization_id=p_org;
 if r.id is not null then return r; end if;
 if not coalesce((p_input->>'task_only')::boolean,false) and kind in ('PICKUP','DELIVERY','TRANSFER','DRAYAGE') then
  if nullif(p_input->>'existing_record_id','') is not null then
   select id,order_number into tx,no from public.transport_orders where id=(p_input->>'existing_record_id')::uuid and organization_id=p_org and order_type=kind;
   if tx is null then raise exception 'No matching transport order in this workspace'; end if;
  else
   insert into public.transport_orders(organization_id,order_number,order_type,status,customer_id,instructions,metadata) values(p_org,'',kind,'DRAFT',customer,coalesce(p_input->>'description',''),jsonb_build_object('operations_request_id',p_id)) returning id,order_number into tx,no;
  end if;
 elsif not coalesce((p_input->>'task_only')::boolean,false) and kind in ('SHIPMENT_AIR','SHIPMENT_OCEAN','SHIPMENT_GROUND') then
  if nullif(p_input->>'existing_record_id','') is not null then
   select id,shipment_number into sh,no from public.shipments where id=(p_input->>'existing_record_id')::uuid and organization_id=p_org and mode=substring(kind from 10);
   if sh is null then raise exception 'No matching shipment in this workspace'; end if;
  else
   insert into public.shipments(organization_id,shipment_number,mode,status,customer_id,notes,metadata) values(p_org,'',substring(kind from 10),'DRAFT',customer,coalesce(p_input->>'description',''),jsonb_build_object('operations_request_id',p_id)) returning id,shipment_number into sh,no;
  end if;
 else no:=public.nodara_next_inbox_number(p_org,'OPERATIONS_REQUEST'); end if;
 insert into public.operations_requests(id,organization_id,request_number,request_type,title,description,customer_id,customer_name,owner_name,next_action,billing_requirement,due_at,follow_up_at,transport_order_id,shipment_id)
 values(p_id,p_org,no,kind,p_input->>'title',coalesce(p_input->>'description',''),customer,coalesce(p_input->>'customer_name',''),coalesce(p_input->>'owner_name',''),coalesce(p_input->>'next_action',''),coalesce(p_input->>'billing_requirement','UNDECIDED'),nullif(p_input->>'due_at','')::timestamptz,nullif(p_input->>'follow_up_at','')::timestamptz,tx,sh) returning * into r;
 if p_message_id is not null then insert into public.operations_request_messages(organization_id,request_id,message_id) values(p_org,r.id,p_message_id) on conflict do nothing; end if;
 if nullif(p_input->>'linked_record_id','') is not null then
  if p_input->>'linked_record_kind' not in ('transport_orders','shipments','warehouse_receipts','cargo_releases') then raise exception 'Unsupported record kind'; end if;
  insert into public.operations_request_transactions(organization_id,request_id,transport_order_id,shipment_id,warehouse_receipt_id,cargo_release_id)
  values(p_org,r.id,case when p_input->>'linked_record_kind'='transport_orders' then (p_input->>'linked_record_id')::uuid end,case when p_input->>'linked_record_kind'='shipments' then (p_input->>'linked_record_id')::uuid end,case when p_input->>'linked_record_kind'='warehouse_receipts' then (p_input->>'linked_record_id')::uuid end,case when p_input->>'linked_record_kind'='cargo_releases' then (p_input->>'linked_record_id')::uuid end);
 end if;
 if p_input ? 'steps' then
  if jsonb_typeof(p_input->'steps')<>'array' or jsonb_array_length(p_input->'steps')>50 then raise exception 'Steps must be a list with at most 50 entries'; end if;
  insert into public.operations_request_checklist(organization_id,request_id,title,created_at)
  select p_org,r.id,value,now()+ordinality*interval '1 microsecond' from jsonb_array_elements_text(p_input->'steps') with ordinality where length(btrim(value))>0;
 end if;
 return r;
end $$;
drop policy if exists links_delete on public.operations_request_messages;
create policy links_delete on public.operations_request_messages for delete to authenticated using (public.nodara_is_org_member(organization_id));
notify pgrst,'reload schema';
commit;
