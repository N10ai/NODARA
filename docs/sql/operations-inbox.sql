-- Operations Inbox: durable requests, captured conversations, and shared TO numbers.
begin;
create policy inbox_counter_insert on public.document_number_counters for insert to authenticated with check(exists(select 1 from public.document_number_schemes s where s.id=scheme_id and public.nodara_is_org_member(s.organization_id)));
create policy inbox_counter_update on public.document_number_counters for update to authenticated using(exists(select 1 from public.document_number_schemes s where s.id=scheme_id and public.nodara_is_org_member(s.organization_id))) with check(exists(select 1 from public.document_number_schemes s where s.id=scheme_id and public.nodara_is_org_member(s.organization_id)));
create table public.operations_requests (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 request_number text not null, request_type text not null check(request_type in ('PICKUP','DELIVERY','TRANSFER','DRAYAGE','SHIPMENT_AIR','SHIPMENT_OCEAN','SHIPMENT_GROUND','DOCUMENTATION','INVENTORY_CHECK','COMPLAINT','COMPLIANCE','OTHER')),
 title text not null check(length(btrim(title))>0), description text not null default '', customer_id uuid references public.entities(id), customer_name text not null default '',
 owner_name text not null default '', next_action text not null default '', waiting_on text not null default '',
 status text not null default 'NEW' check(status in ('NEW','WORKING','WAITING','READY_TO_BILL','COMPLETED','CANCELLED')),
 billing_requirement text not null default 'UNDECIDED' check(billing_requirement in ('REQUIRED','NOT_REQUIRED','UNDECIDED')),
 billing_status text not null default 'PENDING' check(billing_status in ('PENDING','BILLED')), invoice_reference text not null default '',
 due_at timestamptz, follow_up_at timestamptz, transport_order_id uuid references public.transport_orders(id), shipment_id uuid references public.shipments(id),
 created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,request_number)
);
create table public.operations_messages (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 subject text not null default '', sender text not null default '', body text not null check(length(btrim(body))>0),
 source_url text not null default '', source text not null default 'PASTED_EMAIL' check(source in ('PASTED_EMAIL','PHONE','WHATSAPP','NOTE')),
 received_at timestamptz not null default now(), reviewed_at timestamptz, created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create table public.operations_request_messages (
 organization_id uuid not null references public.organizations(id), request_id uuid not null references public.operations_requests(id),
 message_id uuid not null references public.operations_messages(id), created_at timestamptz not null default now(), primary key(request_id,message_id)
);
create table public.operations_request_activity (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), request_id uuid not null references public.operations_requests(id),
 actor_id uuid default auth.uid(), event text not null, changes jsonb not null, created_at timestamptz not null default now()
);
create index on public.operations_requests(organization_id,status,created_at desc);
create index on public.operations_requests(organization_id,follow_up_at) where status not in ('COMPLETED','CANCELLED');
create index on public.operations_messages(organization_id,received_at desc);
create index on public.operations_request_messages(message_id);
create index on public.operations_request_activity(request_id,created_at desc);
alter table public.operations_requests enable row level security;
alter table public.operations_messages enable row level security;
alter table public.operations_request_messages enable row level security;
alter table public.operations_request_activity enable row level security;
create policy requests_read on public.operations_requests for select to authenticated using(public.nodara_is_org_member(organization_id));
create policy requests_insert on public.operations_requests for insert to authenticated with check(public.nodara_is_org_member(organization_id));
create policy requests_update on public.operations_requests for update to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
create policy messages_read on public.operations_messages for select to authenticated using(public.nodara_is_org_member(organization_id));
create policy messages_insert on public.operations_messages for insert to authenticated with check(public.nodara_is_org_member(organization_id));
create policy messages_update on public.operations_messages for update to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
create policy links_read on public.operations_request_messages for select to authenticated using(public.nodara_is_org_member(organization_id));
create policy links_insert on public.operations_request_messages for insert to authenticated with check(public.nodara_is_org_member(organization_id));
create policy activity_read on public.operations_request_activity for select to authenticated using(public.nodara_is_org_member(organization_id));
grant select,insert,update on public.operations_requests,public.operations_messages to authenticated;
grant select,insert on public.operations_request_messages to authenticated;
grant select on public.operations_request_activity to authenticated;

-- Both ordinary transport creation and Inbox creation use the same locked counter.
create function public.nodara_next_inbox_number(p_org uuid,p_type text) returns text language plpgsql security invoker set search_path=public as $$
declare s public.document_number_schemes; n bigint; max_used bigint;
begin
 if not public.nodara_is_org_member(p_org) or p_type not in ('TRANSPORT_ORDER','OPERATIONS_REQUEST') then raise exception 'Workspace access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_type,0));
 insert into public.document_number_schemes(organization_id,document_type,name,prefix,date_format,format_template,sequence_padding,reset_period)
 values(p_org,p_type,case p_type when 'TRANSPORT_ORDER' then 'Transport Order' else 'Operations Request' end,case p_type when 'TRANSPORT_ORDER' then 'TO' else 'REQ' end,'','{PREFIX}-{SEQ}',3,'NONE') on conflict do nothing;
 select * into s from public.document_number_schemes where organization_id=p_org and document_type=p_type and is_active;
 if p_type='TRANSPORT_ORDER' then select coalesce(max(substring(order_number from '^TO-([0-9]+)$')::bigint),0) into max_used from public.transport_orders where organization_id=p_org;
 else select coalesce(max(substring(request_number from '^REQ-([0-9]+)$')::bigint),0) into max_used from public.operations_requests where organization_id=p_org; end if;
 insert into public.document_number_counters(scheme_id,period_key,last_value) values(s.id,'ALL',greatest(max_used+1,s.starting_number))
 on conflict(scheme_id,period_key) do update set last_value=greatest(public.document_number_counters.last_value+1,max_used+1),updated_at=now() returning last_value into n;
 return s.prefix||'-'||lpad(n::text,greatest(s.sequence_padding,length(n::text)),'0');
end $$;
revoke all on function public.nodara_next_inbox_number(uuid,text) from public,anon;
grant execute on function public.nodara_next_inbox_number(uuid,text) to authenticated;
create function public.nodara_transport_inbox_number() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if nullif(btrim(new.order_number),'') is null then new.order_number:=public.nodara_next_inbox_number(new.organization_id,'TRANSPORT_ORDER'); end if;
 return new;
end $$;
create trigger aaa_transport_shared_number before insert on public.transport_orders for each row execute function public.nodara_transport_inbox_number();

create function public.nodara_guard_inbox_request() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.request_number<>old.request_number or new.request_type<>old.request_type or new.transport_order_id is distinct from old.transport_order_id or new.shipment_id is distinct from old.shipment_id) then raise exception 'Request identity and transaction links cannot be changed'; end if;
 if new.customer_id is not null and not exists(select 1 from public.entities where id=new.customer_id and organization_id=new.organization_id) then raise exception 'Customer belongs to another workspace'; end if;
 if new.transport_order_id is not null and not exists(select 1 from public.transport_orders where id=new.transport_order_id and organization_id=new.organization_id and order_number=new.request_number) then raise exception 'Invalid transport link'; end if;
 if new.shipment_id is not null and not exists(select 1 from public.shipments where id=new.shipment_id and organization_id=new.organization_id and shipment_number=new.request_number) then raise exception 'Invalid shipment link'; end if;
 if new.billing_status='BILLED' and nullif(btrim(new.invoice_reference),'') is null then raise exception 'Enter the invoice reference before marking billed'; end if;
 if new.status='READY_TO_BILL' and new.billing_requirement<>'REQUIRED' then raise exception 'Ready to bill requires billable work'; end if;
 if new.status='COMPLETED' and (new.billing_requirement='UNDECIDED' or (new.billing_requirement='REQUIRED' and new.billing_status<>'BILLED')) then raise exception 'Resolve billing before completing this request'; end if;
 new.updated_at:=now(); return new;
end $$;
create trigger guard_inbox_request before insert or update on public.operations_requests for each row execute function public.nodara_guard_inbox_request();
create function public.nodara_guard_inbox_link() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from public.operations_requests where id=new.request_id and organization_id=new.organization_id) or not exists(select 1 from public.operations_messages where id=new.message_id and organization_id=new.organization_id) then raise exception 'Conversation and request must belong to this workspace'; end if;
 return new;
end $$;
create trigger guard_inbox_link before insert on public.operations_request_messages for each row execute function public.nodara_guard_inbox_link();

-- A trigger alone writes the audit table; clients have read-only access.
create function public.nodara_audit_inbox_request() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 insert into public.operations_request_activity(organization_id,request_id,event,changes) values(new.organization_id,new.id,tg_op,case when tg_op='INSERT' then jsonb_build_object('after',to_jsonb(new)) else jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)) end);
 return new;
end $$;
revoke all on function public.nodara_audit_inbox_request() from public,anon,authenticated;
create trigger audit_inbox_request after insert or update on public.operations_requests for each row execute function public.nodara_audit_inbox_request();

create function public.nodara_create_operations_request(p_org uuid,p_input jsonb,p_id uuid,p_message_id uuid default null) returns public.operations_requests language plpgsql security invoker set search_path=public as $$
declare r public.operations_requests; kind text:=p_input->>'request_type'; no text; tx uuid; sh uuid; customer uuid:=nullif(p_input->>'customer_id','')::uuid;
begin
 if not public.nodara_is_org_member(p_org) then raise exception 'Workspace access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.operations_requests where id=p_id and organization_id=p_org;
 if r.id is not null then return r; end if;
 if kind in ('PICKUP','DELIVERY','TRANSFER','DRAYAGE') then
  if nullif(p_input->>'existing_record_id','') is not null then
   select id,order_number into tx,no from public.transport_orders where id=(p_input->>'existing_record_id')::uuid and organization_id=p_org and order_type=kind;
   if tx is null then raise exception 'No matching transport order in this workspace'; end if;
  else
   insert into public.transport_orders(organization_id,order_number,order_type,status,customer_id,instructions,metadata) values(p_org,'',kind,'DRAFT',customer,coalesce(p_input->>'description',''),jsonb_build_object('operations_request_id',p_id)) returning id,order_number into tx,no;
  end if;
 elsif kind in ('SHIPMENT_AIR','SHIPMENT_OCEAN','SHIPMENT_GROUND') then
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
 return r;
end $$;
revoke all on function public.nodara_create_operations_request(uuid,jsonb,uuid,uuid) from public,anon;
grant execute on function public.nodara_create_operations_request(uuid,jsonb,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
