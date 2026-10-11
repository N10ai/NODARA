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
   if not exists(select 1 from public.entity_onboarding_packet_documents where packet_id=p.id and submitted_at is null) then update public.entity_onboarding_packets set status='COMPLETED',completed_at=now() where id=p.id;p.status:='COMPLETED';end if;
  end if;
 end if;
 return jsonb_build_object('status',p.status,'recipient_name',p.recipient_name,'recipient_email',p.recipient_email,'expires_at',p.expires_at,'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'document_type',x.document_type,'template_version',x.template_version,'design',x.template_snapshot,'fields',x.field_definitions,'prefill',x.prefill,'responses',x.responses,'submitted_at',x.submitted_at,'signer_name',x.signer_name,'signer_email',x.signer_email,'signer_title',x.signer_title,'consent_text',x.consent_text,'content_hash',x.content_hash) order by x.sort_order),'[]') from public.entity_onboarding_packet_documents x where x.packet_id=p.id));
end $$;
revoke all on function public.nodara_onboarding_packet(text,jsonb) from public;
grant execute on function public.nodara_onboarding_packet(text,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
