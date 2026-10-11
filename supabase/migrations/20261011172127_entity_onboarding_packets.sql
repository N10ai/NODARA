alter table public.entity_legal_profiles add column if not exists customer_type text;

-- Staff see packets in their organization; bearer tokens are never stored on exposed rows.
create schema if not exists nodara_private;
revoke all on schema nodara_private from public,anon,authenticated;
create table public.entity_onboarding_packets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 entity_id uuid not null references public.entities(id), recipient_name text not null, recipient_email text not null,
 status text not null default 'OPEN' check(status in ('OPEN','COMPLETED','REVOKED')),
 expires_at timestamptz not null, created_by uuid references auth.users(id), created_at timestamptz not null default now(), completed_at timestamptz
);
create table nodara_private.onboarding_tokens (
 packet_id uuid primary key references public.entity_onboarding_packets(id) on delete cascade, token_hash text not null unique
);
alter table nodara_private.onboarding_tokens enable row level security;
create table public.entity_onboarding_packet_documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 packet_id uuid not null references public.entity_onboarding_packets(id), sort_order integer not null,
 document_type text not null, title text not null, template_id text not null, template_version integer not null,
 template_snapshot jsonb not null, field_definitions jsonb not null, prefill jsonb not null default '{}',
 responses jsonb, signer_name text, signer_email text, signer_title text, consent_text text, submitted_at timestamptz,
 content_hash text, request_evidence jsonb, document_id uuid references public.documents(id),
 review_status text not null default 'PENDING' check(review_status in ('PENDING','APPROVED','REJECTED')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 requirement_id uuid references public.entity_onboarding_requirements(id), unique(packet_id,sort_order)
);
create index on public.entity_onboarding_packets(organization_id,entity_id,created_at desc);
create index on public.entity_onboarding_packet_documents(packet_id,sort_order);
alter table public.entity_onboarding_packets enable row level security;
alter table public.entity_onboarding_packet_documents enable row level security;
revoke all on public.entity_onboarding_packets,public.entity_onboarding_packet_documents from public,anon,authenticated;
grant select on public.entity_onboarding_packets,public.entity_onboarding_packet_documents to authenticated;
create policy onboarding_packet_read on public.entity_onboarding_packets for select to authenticated using(nodara_is_org_member(organization_id));
create policy onboarding_packet_document_read on public.entity_onboarding_packet_documents for select to authenticated using(nodara_is_org_member(organization_id));

-- Atomically save the identity and canonical contact/address/legal records.
create or replace function public.nodara_save_entity_profile(p_entity jsonb,p_contacts jsonb,p_addresses jsonb,p_legal jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare eid uuid:=nullif(p_entity->>'id','')::uuid; oid uuid:=(p_entity->>'organization_id')::uuid; r jsonb; rid uuid; keep uuid[]:='{}';
begin
 if not nodara_is_org_member(oid) then raise exception 'Entity access denied';end if;
 if nullif(trim(p_entity->>'name'),'') is null then raise exception 'Company name is required';end if;
 if jsonb_typeof(p_contacts)<>'array' or jsonb_typeof(p_addresses)<>'array' then raise exception 'Contacts and addresses must be lists';end if;
 if (select count(*) from jsonb_array_elements(p_contacts) x where coalesce((x->>'is_primary')::boolean,false))>1 then raise exception 'Choose one primary contact';end if;
 if (select count(*) from jsonb_array_elements(p_addresses) x where coalesce((x->>'is_primary')::boolean,false))>1 then raise exception 'Choose one primary address';end if;
 if eid is null then
  insert into entities(organization_id,name,code,email,phone,roles,sop) values(oid,trim(p_entity->>'name'),nullif(p_entity->>'code',''),nullif(p_entity->>'email',''),nullif(p_entity->>'phone',''),array(select jsonb_array_elements_text(p_entity->'roles')),coalesce(p_entity->'sop','{}')) returning id into eid;
 else
  perform 1 from entities where id=eid and organization_id=oid for update;if not found then raise exception 'Entity access denied';end if;
  update entities set name=trim(p_entity->>'name'),code=nullif(p_entity->>'code',''),email=nullif(p_entity->>'email',''),phone=nullif(p_entity->>'phone',''),roles=array(select jsonb_array_elements_text(p_entity->'roles')),sop=coalesce(p_entity->'sop','{}'),updated_at=now() where id=eid;
 end if;
 for r in select * from jsonb_array_elements(p_contacts) loop
  if nullif(trim(r->>'name'),'') is null then raise exception 'Each contact needs a name';end if;
  rid:=nullif(r->>'id','')::uuid;
  if rid is not null and not exists(select 1 from entity_contacts where id=rid and entity_id=eid and organization_id=oid) then raise exception 'Contact does not belong to this entity';end if;
  rid:=coalesce(rid,gen_random_uuid());keep:=array_append(keep,rid);
  insert into entity_contacts(id,organization_id,entity_id,name,title,email,phone,roles,is_primary,active)
  values(rid,oid,eid,trim(r->>'name'),r->>'title',r->>'email',r->>'phone',array(select jsonb_array_elements_text(coalesce(r->'roles','[]'))),coalesce((r->>'is_primary')::boolean,false),true)
  on conflict(id) do update set name=excluded.name,title=excluded.title,email=excluded.email,phone=excluded.phone,roles=excluded.roles,is_primary=excluded.is_primary,active=true,updated_at=now();
 end loop;
 update entity_contacts set active=false,is_primary=false,updated_at=now() where entity_id=eid and organization_id=oid and not(id=any(keep));keep:='{}';
 for r in select * from jsonb_array_elements(p_addresses) loop
  if nullif(trim(r->>'line1'),'') is null then raise exception 'Each address needs a street address';end if;
  rid:=nullif(r->>'id','')::uuid;
  if rid is not null and not exists(select 1 from entity_addresses where id=rid and entity_id=eid and organization_id=oid) then raise exception 'Address does not belong to this entity';end if;
  rid:=coalesce(rid,gen_random_uuid());keep:=array_append(keep,rid);
  insert into entity_addresses(id,organization_id,entity_id,address_type,name,line1,line2,city,state_region,postal_code,country_code,is_primary,active)
  values(rid,oid,eid,coalesce(r->>'address_type','OFFICE'),r->>'name',trim(r->>'line1'),r->>'line2',r->>'city',r->>'state_region',r->>'postal_code',r->>'country_code',coalesce((r->>'is_primary')::boolean,false),true)
  on conflict(id) do update set address_type=excluded.address_type,name=excluded.name,line1=excluded.line1,line2=excluded.line2,city=excluded.city,state_region=excluded.state_region,postal_code=excluded.postal_code,country_code=excluded.country_code,is_primary=excluded.is_primary,active=true,updated_at=now();
 end loop;
 update entity_addresses set active=false,is_primary=false,updated_at=now() where entity_id=eid and organization_id=oid and not(id=any(keep));
 insert into entity_legal_profiles(organization_id,entity_id,legal_name,dba_name,entity_type,customer_type,jurisdiction,registration_number,website,payment_terms,credit_status)
 values(oid,eid,nullif(p_legal->>'legal_name',''),nullif(p_legal->>'dba_name',''),nullif(p_legal->>'entity_type',''),nullif(p_legal->>'customer_type',''),nullif(p_legal->>'jurisdiction',''),nullif(p_legal->>'registration_number',''),nullif(p_legal->>'website',''),nullif(p_legal->>'payment_terms',''),coalesce(nullif(p_legal->>'credit_status',''),'NOT_REQUESTED'))
 on conflict(entity_id) do update set legal_name=excluded.legal_name,dba_name=excluded.dba_name,entity_type=excluded.entity_type,customer_type=excluded.customer_type,jurisdiction=excluded.jurisdiction,registration_number=excluded.registration_number,website=excluded.website,payment_terms=excluded.payment_terms,credit_status=excluded.credit_status,updated_at=now();
 return eid;
end $$;
revoke all on function public.nodara_save_entity_profile(jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.nodara_save_entity_profile(jsonb,jsonb,jsonb,jsonb) to authenticated;

-- Staff create a fixed, published template version for each selected document.
create or replace function public.nodara_create_onboarding_packet(p_entity_id uuid,p_recipient_name text,p_recipient_email text,p_documents jsonb,p_days integer default 14)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.entities%rowtype; t public.document_templates%rowtype; item jsonb; pid uuid; prof uuid; req uuid; token text; i integer:=0; bindings jsonb; fields jsonb; k text; label text;
begin
 select * into e from public.entities where id=p_entity_id;
 if auth.uid() is null or e.id is null or not public.nodara_is_org_member(e.organization_id) then raise exception 'Entity access denied';end if;
 if nullif(trim(p_recipient_name),'') is null or p_recipient_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Recipient name and email are required';end if;
 if p_days not between 1 and 30 or jsonb_typeof(p_documents)<>'array' or jsonb_array_length(p_documents) not between 1 and 12 then raise exception 'Choose 1 to 12 documents and a 1 to 30 day expiry';end if;
 insert into public.entity_onboarding_profiles(organization_id,entity_id,status) values(e.organization_id,e.id,'IN_PROGRESS') on conflict(entity_id) do nothing;
 select id into prof from public.entity_onboarding_profiles where entity_id=e.id;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.entity_onboarding_packets(organization_id,entity_id,recipient_name,recipient_email,expires_at,created_by)
 values(e.organization_id,e.id,trim(p_recipient_name),lower(trim(p_recipient_email)),now()+make_interval(days=>p_days),auth.uid()) returning id into pid;
 insert into nodara_private.onboarding_tokens values(pid,encode(extensions.digest(token,'sha256'),'hex'));
 select jsonb_build_object('customer.name',e.name,'customer.code',e.code,'customer.email',e.email,'customer.phone',e.phone,'customer.legal_name',l.legal_name,'customer.dba_name',l.dba_name,'customer.payment_terms',l.payment_terms,'customer.website',l.website) into bindings from public.entity_legal_profiles l where l.entity_id=e.id;
 bindings:=coalesce(bindings,jsonb_build_object('customer.name',e.name,'customer.email',e.email,'customer.phone',e.phone));
 for item in select * from jsonb_array_elements(p_documents) loop
  select * into t from public.document_templates where id=item->>'template_id' and status='published' and organization_id=e.organization_id;
  if t.id is null or t.design is null then raise exception 'Select a published template owned by this organization';end if;
  if not exists(select 1 from jsonb_array_elements(t.placements) x where x->>'surface'='Onboarding') then raise exception 'Template is not available for onboarding';end if;
  fields:=coalesce(t.design->'onboardingFields','[]');
  if jsonb_typeof(fields)<>'array' or jsonb_array_length(fields)>40 then raise exception 'Invalid template fields';end if;
  if nullif(item->>'document_type','') is null then raise exception 'Choose a document type';end if;
  k:='DOC_'||upper(regexp_replace(t.id,'[^a-zA-Z0-9]','_','g'));label:=t.name;
  insert into public.entity_onboarding_requirements(organization_id,onboarding_profile_id,requirement_code,requirement_type,label,required,status)
  values(e.organization_id,prof,k,'DOCUMENT',label,true,'PENDING') on conflict(onboarding_profile_id,requirement_code) do update set status='PENDING',document_id=null,updated_at=now() returning id into req;
  i:=i+1;
  insert into public.entity_onboarding_packet_documents(organization_id,packet_id,sort_order,document_type,title,template_id,template_version,template_snapshot,field_definitions,prefill,requirement_id)
  values(e.organization_id,pid,i,item->>'document_type',t.name,t.id,t.version,t.design,fields,bindings,req);
 end loop;
 return jsonb_build_object('id',pid,'token',token,'expires_at',now()+make_interval(days=>p_days));
end $$;
revoke all on function public.nodara_create_onboarding_packet(uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.nodara_create_onboarding_packet(uuid,text,text,jsonb,integer) to authenticated;

-- This is the only anonymous API: possession of an unexpired 256-bit token authenticates one packet.
create or replace function public.nodara_onboarding_packet(p_token text,p_submission jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.entity_onboarding_packets%rowtype; d public.entity_onboarding_packet_documents%rowtype; field jsonb; answers jsonb; key text; value text; did uuid; hdr jsonb; consent constant text:='I have reviewed this document and its completed fields. I am authorized to act for this company and agree to sign electronically using my typed name.';
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'This link is unavailable or expired';end if;
 select packet.* into p from public.entity_onboarding_packets packet join nodara_private.onboarding_tokens tok on tok.packet_id=packet.id
 where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update of packet;
 if p.id is null or p.status='REVOKED' or p.expires_at<=now() then raise exception 'This link is unavailable or expired';end if;
 if p_submission is not null then
  select * into d from public.entity_onboarding_packet_documents where id=(p_submission->>'document_id')::uuid and packet_id=p.id for update;
  if d.id is null then raise exception 'Document is not part of this packet';end if;
  if d.submitted_at is null then
   if exists(select 1 from public.entity_onboarding_packet_documents where packet_id=p.id and sort_order<d.sort_order and submitted_at is null) then raise exception 'Complete the preceding document first';end if;
   if p.status<>'OPEN' then raise exception 'Packet is already completed';end if;
   if coalesce((p_submission->>'consent')::boolean,false) is not true or nullif(trim(p_submission->>'signer_name'),'') is null or lower(trim(p_submission->>'signer_email')) is distinct from p.recipient_email then raise exception 'Provide your name, the invited email and electronic signature consent';end if;
   answers:=coalesce(p_submission->'responses','{}');
   if jsonb_typeof(answers)<>'object' or octet_length(answers::text)>40000 then raise exception 'Invalid form responses';end if;
   for key in select jsonb_object_keys(answers) loop
    if not exists(select 1 from jsonb_array_elements(d.field_definitions) x where x->>'key'=key) then raise exception 'Unexpected form field';end if;
   end loop;
   for field in select * from jsonb_array_elements(d.field_definitions) loop
    key:=field->>'key';value:=answers->>key;
    if coalesce((field->>'required')::boolean,false) and nullif(trim(value),'') is null then raise exception 'Required field: %',field->>'label';end if;
    if length(value)>4000 then raise exception 'Form field is too long';end if;
   end loop;
   hdr:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
   update public.entity_onboarding_packet_documents set responses=answers,signer_name=left(trim(p_submission->>'signer_name'),200),signer_email=p.recipient_email,signer_title=left(p_submission->>'signer_title',200),consent_text=consent,submitted_at=now(),content_hash=encode(extensions.digest(jsonb_build_object('template',template_snapshot,'prefill',prefill,'responses',answers,'signer',p_submission->>'signer_name','email',p.recipient_email,'consent',consent,'time',now())::text,'sha256'),'hex'),request_evidence=jsonb_build_object('user_agent',left(hdr->>'user-agent',1000),'ip',left(split_part(hdr->>'x-forwarded-for',',',1),100)) where id=d.id returning * into d;
   insert into public.documents(organization_id,entity_id,document_type,storage_path,file_name,mime_type,display_name,category,status,source,metadata,provenance)
   values(p.organization_id,p.entity_id,d.document_type,'onboarding-record/'||d.id,d.title||'.html','text/html',d.title,'CUSTOMER','ACTIVE','ONBOARDING_SIGNATURE',jsonb_build_object('onboarding_packet_document_id',d.id,'review_status','PENDING','content_hash',d.content_hash),jsonb_build_object('packet_id',p.id,'template_id',d.template_id,'template_version',d.template_version,'signed_at',d.submitted_at)) returning id into did;
   insert into public.document_links(organization_id,document_id,entity_id,context_type,context_id,link_role) values(p.organization_id,did,p.entity_id,'ENTITY',p.entity_id,'ONBOARDING');
   update public.entity_onboarding_packet_documents set document_id=did where id=d.id;
   update public.entity_onboarding_requirements set document_id=did,evidence=jsonb_build_object('signature_received',true,'packet_document_id',d.id,'review_required',true),updated_at=now() where id=d.requirement_id;
   if not exists(select 1 from public.entity_onboarding_packet_documents where packet_id=p.id and submitted_at is null) then update public.entity_onboarding_packets set status='COMPLETED',completed_at=now() where id=p.id;p.status:='COMPLETED';end if;
  end if;
 end if;
 return jsonb_build_object('status',p.status,'recipient_name',p.recipient_name,'recipient_email',p.recipient_email,'expires_at',p.expires_at,'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'document_type',x.document_type,'template_version',x.template_version,'design',x.template_snapshot,'fields',x.field_definitions,'prefill',x.prefill,'responses',x.responses,'submitted_at',x.submitted_at,'signer_name',x.signer_name,'signer_email',x.signer_email,'signer_title',x.signer_title,'consent_text',x.consent_text,'content_hash',x.content_hash) order by x.sort_order),'[]') from public.entity_onboarding_packet_documents x where x.packet_id=p.id));
end $$;
revoke all on function public.nodara_onboarding_packet(text,jsonb) from public;
grant execute on function public.nodara_onboarding_packet(text,jsonb) to anon,authenticated;

create or replace function public.nodara_review_onboarding_document(p_id uuid,p_approved boolean)
returns void language plpgsql security definer set search_path='' as $$
declare d public.entity_onboarding_packet_documents%rowtype;
begin
 select * into d from public.entity_onboarding_packet_documents where id=p_id for update;
 if auth.uid() is null or d.id is null or not public.nodara_is_org_member(d.organization_id) then raise exception 'Document access denied';end if;
 if d.submitted_at is null then raise exception 'Document has not been signed';end if;
 update public.entity_onboarding_packet_documents set review_status=case when p_approved then 'APPROVED' else 'REJECTED' end,reviewed_by=auth.uid(),reviewed_at=now() where id=d.id;
 update public.entity_onboarding_requirements set status=case when p_approved then 'SATISFIED' else 'PENDING' end,evidence=coalesce(evidence,'{}')||jsonb_build_object('review_status',case when p_approved then 'APPROVED' else 'REJECTED' end,'reviewed_by',auth.uid(),'reviewed_at',now()),updated_at=now() where id=d.requirement_id;
 update public.documents set metadata=metadata||jsonb_build_object('review_status',case when p_approved then 'APPROVED' else 'REJECTED' end),updated_at=now() where id=d.document_id;
end $$;
create or replace function public.nodara_revoke_onboarding_packet(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.entity_onboarding_packets%rowtype;
begin
 select * into p from public.entity_onboarding_packets where id=p_id for update;
 if auth.uid() is null or p.id is null or not public.nodara_is_org_member(p.organization_id) then raise exception 'Packet access denied';end if;
 update public.entity_onboarding_packets set status='REVOKED' where id=p.id;
end $$;
revoke all on function public.nodara_review_onboarding_document(uuid,boolean),public.nodara_revoke_onboarding_packet(uuid) from public,anon;
grant execute on function public.nodara_review_onboarding_document(uuid,boolean),public.nodara_revoke_onboarding_packet(uuid) to authenticated;
notify pgrst,'reload schema';
-- Shared built-in designs are read-only; edited copies belong to the workspace.
drop policy if exists document_templates_authenticated_read on public.document_templates;
drop policy if exists document_templates_authenticated_insert on public.document_templates;
drop policy if exists document_templates_authenticated_update on public.document_templates;
drop policy if exists document_templates_authenticated_delete on public.document_templates;
create policy document_templates_workspace_read on public.document_templates for select to authenticated using((organization_id is null and builtin) or nodara_is_org_member(organization_id));
create policy document_templates_workspace_insert on public.document_templates for insert to authenticated with check(nodara_is_org_member(organization_id));
create policy document_templates_workspace_update on public.document_templates for update to authenticated using(nodara_is_org_member(organization_id)) with check(nodara_is_org_member(organization_id));
create policy document_templates_workspace_delete on public.document_templates for delete to authenticated using(nodara_is_org_member(organization_id));
