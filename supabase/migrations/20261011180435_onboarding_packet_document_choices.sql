-- Existing packets retain required signatures. Choices are fixed when issued.
alter table public.entity_onboarding_packet_documents
 add column required boolean not null default true,
 add column skipped_at timestamptz;
alter table public.entity_onboarding_packet_documents add constraint onboarding_document_skip_valid
 check (skipped_at is null or (not required and submitted_at is null));
create or replace function public.nodara_create_onboarding_packet(p_entity_id uuid,p_recipient_name text,p_recipient_email text,p_documents jsonb,p_days integer default 14)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.entities%rowtype; t public.document_templates%rowtype; item jsonb; pid uuid; prof uuid; req uuid; token text; i integer:=0; bindings jsonb; fields jsonb; k text; label text; must_sign boolean;
begin
 select * into e from public.entities where id=p_entity_id;
 if auth.uid() is null or e.id is null or not public.nodara_is_org_member(e.organization_id) then raise exception 'Entity access denied';end if;
 if nullif(trim(p_recipient_name),'') is null or p_recipient_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Recipient name and email are required';end if;
 if p_days is null or p_days not between 1 and 30 or p_documents is null or jsonb_typeof(p_documents)<>'array' or jsonb_array_length(p_documents) not between 1 and 12 then raise exception 'Choose 1 to 12 documents and a 1 to 30 day expiry';end if;
 insert into public.entity_onboarding_profiles(organization_id,entity_id,status) values(e.organization_id,e.id,'IN_PROGRESS') on conflict(organization_id,entity_id) do nothing;
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
  if coalesce(jsonb_array_length(t.design->'objects'),0)=0 and nullif(t.design->>'background','') is null then raise exception 'Design the complete document before requesting signatures';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(t.design->'objects','[]')) x where x->>'type' in ('qr','barcode')) then raise exception 'Onboarding signing does not support code objects; remove them from this template';end if;
  if t.design->>'referenceOnly'='true' then raise exception 'This official reference form must be completed and uploaded as a signed PDF';end if;
  fields:=coalesce(t.design->'onboardingFields','[]');
  if jsonb_typeof(fields)<>'array' or jsonb_array_length(fields)>40 then raise exception 'Invalid template fields';end if;
  if exists(select 1 from jsonb_array_elements(fields) f where nullif(trim(f->>'label'),'') is null or coalesce(f->>'key','') !~ '^[-a-zA-Z0-9_.]{1,80}$' or coalesce(f->>'type','text') not in ('text','email','date','number','textarea')) or (select count(*) from jsonb_array_elements(fields))<>(select count(distinct f->>'key') from jsonb_array_elements(fields) f) then raise exception 'Template field definitions need unique keys and labels';end if;
  if nullif(item->>'document_type','') is null then raise exception 'Choose a document type';end if;
  if item ? 'required' and jsonb_typeof(item->'required')<>'boolean' then raise exception 'Choose whether each document is required';end if;
  must_sign:=coalesce((item->>'required')::boolean,true);
  k:='DOC_'||upper(regexp_replace(t.id,'[^a-zA-Z0-9]','_','g'));label:=t.name;
  insert into public.entity_onboarding_requirements(organization_id,onboarding_profile_id,requirement_code,requirement_type,label,required,status)
  values(e.organization_id,prof,k,'DOCUMENT',label,must_sign,'PENDING') on conflict(onboarding_profile_id,requirement_code) do update set required=excluded.required,status='PENDING',document_id=null,updated_at=now() returning id into req;
  i:=i+1;
  if item->>'document_type'='RATE_AGREEMENT' then
   select coalesce(jsonb_agg(jsonb_build_object('service',c.name,'unit',r.unit,'rate',r.sell_rate,'currency',r.currency,'minimum',r.minimum_charge,'effective_from',r.effective_from,'effective_to',r.effective_to) order by c.name),'[]') into fields from public.customer_rate_agreements r join public.service_catalog c on c.id=r.service_id where r.organization_id=e.organization_id and r.customer_id=e.id and r.active;
   if jsonb_array_length(fields)=0 then raise exception 'Configure the customer recurring rate sheet before requesting agreement';end if;
   bindings:=bindings||jsonb_build_object('rate_sheet',fields);fields:=coalesce(t.design->'onboardingFields','[]');
  else bindings:=bindings-'rate_sheet';end if;
  insert into public.entity_onboarding_packet_documents(organization_id,packet_id,sort_order,document_type,title,template_id,template_version,template_snapshot,field_definitions,prefill,requirement_id,required)
  values(e.organization_id,pid,i,item->>'document_type',t.name,t.id,t.version,t.design,fields,bindings,req,must_sign);
 end loop;
 return jsonb_build_object('id',pid,'token',token,'expires_at',now()+make_interval(days=>p_days));
end $$;
revoke all on function public.nodara_create_onboarding_packet(uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.nodara_create_onboarding_packet(uuid,text,text,jsonb,integer) to authenticated;

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
  if d.submitted_at is null and d.skipped_at is null then
   if exists(select 1 from public.entity_onboarding_packet_documents where packet_id=p.id and sort_order<d.sort_order and submitted_at is null and skipped_at is null) then raise exception 'Complete the preceding document first';end if;
   if p.status<>'OPEN' then raise exception 'Packet is already completed';end if;
   if coalesce((p_submission->>'skip')::boolean,false) then
    if d.required then raise exception 'This document is required and cannot be skipped';end if;
    hdr:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
    update public.entity_onboarding_packet_documents set skipped_at=now(),request_evidence=jsonb_build_object('action','SKIPPED','user_agent',left(hdr->>'user-agent',1000)) where id=d.id;
    update public.entity_onboarding_requirements set evidence=jsonb_build_object('optional_document_skipped',true,'packet_document_id',d.id),updated_at=now() where id=d.requirement_id and document_id is null;
   else
   if coalesce((p_submission->>'consent')::boolean,false) is not true or nullif(trim(p_submission->>'signer_name'),'') is null or nullif(trim(p_submission->>'signer_title'),'') is null or lower(trim(p_submission->>'signer_email')) is distinct from p.recipient_email then raise exception 'Provide your name, the invited email and electronic signature consent';end if;
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
   update public.entity_onboarding_packet_documents set responses=answers,signer_name=left(trim(p_submission->>'signer_name'),200),signer_email=p.recipient_email,signer_title=left(trim(p_submission->>'signer_title'),200),consent_text=consent,submitted_at=now(),content_hash=encode(extensions.digest(jsonb_build_object('template',template_snapshot,'prefill',prefill,'responses',answers,'signer',left(trim(p_submission->>'signer_name'),200),'title',left(trim(p_submission->>'signer_title'),200),'version',template_version,'document_type',document_type,'email',p.recipient_email,'consent',consent,'time',now())::text,'sha256'),'hex'),request_evidence=jsonb_build_object('user_agent',left(hdr->>'user-agent',1000),'ip',left(split_part(hdr->>'x-forwarded-for',',',1),100)) where id=d.id returning * into d;
   insert into public.documents(organization_id,entity_id,document_type,storage_path,file_name,mime_type,display_name,category,status,source,metadata,provenance)
   values(p.organization_id,p.entity_id,d.document_type,'onboarding-record/'||d.id,d.title||'.html','text/html',d.title,'CUSTOMER','ACTIVE','ONBOARDING_SIGNATURE',jsonb_build_object('onboarding_packet_document_id',d.id,'review_status','PENDING','content_hash',d.content_hash),jsonb_build_object('packet_id',p.id,'template_id',d.template_id,'template_version',d.template_version,'signed_at',d.submitted_at)) returning id into did;
   insert into public.document_links(organization_id,document_id,entity_id,context_type,context_id,link_role) values(p.organization_id,did,p.entity_id,'ENTITY',p.entity_id,'ONBOARDING');
   update public.entity_onboarding_packet_documents set document_id=did where id=d.id;
   update public.entity_onboarding_requirements set document_id=did,evidence=jsonb_build_object('signature_received',true,'packet_document_id',d.id,'review_required',true),updated_at=now() where id=d.requirement_id;
   end if;
   if not exists(select 1 from public.entity_onboarding_packet_documents where packet_id=p.id and submitted_at is null and skipped_at is null) then update public.entity_onboarding_packets set status='COMPLETED',completed_at=now() where id=p.id;p.status:='COMPLETED';end if;
  end if;
 end if;
 return jsonb_build_object('status',p.status,'recipient_name',p.recipient_name,'recipient_email',p.recipient_email,'expires_at',p.expires_at,'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'document_type',x.document_type,'template_version',x.template_version,'design',x.template_snapshot,'fields',x.field_definitions,'prefill',x.prefill,'responses',x.responses,'required',x.required,'skipped_at',x.skipped_at,'submitted_at',x.submitted_at,'signer_name',x.signer_name,'signer_email',x.signer_email,'signer_title',x.signer_title,'consent_text',x.consent_text,'content_hash',x.content_hash) order by x.sort_order),'[]') from public.entity_onboarding_packet_documents x where x.packet_id=p.id));
end $$;
revoke all on function public.nodara_onboarding_packet(text,jsonb) from public;
grant execute on function public.nodara_onboarding_packet(text,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
