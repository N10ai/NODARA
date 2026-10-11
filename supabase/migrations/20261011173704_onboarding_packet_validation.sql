create or replace function public.nodara_create_onboarding_packet(p_entity_id uuid,p_recipient_name text,p_recipient_email text,p_documents jsonb,p_days integer default 14)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.entities%rowtype; t public.document_templates%rowtype; item jsonb; pid uuid; prof uuid; req uuid; token text; i integer:=0; bindings jsonb; fields jsonb; k text; label text;
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
  fields:=coalesce(t.design->'onboardingFields','[]');
  if jsonb_typeof(fields)<>'array' or jsonb_array_length(fields)>40 then raise exception 'Invalid template fields';end if;
  if exists(select 1 from jsonb_array_elements(fields) f where nullif(trim(f->>'label'),'') is null or coalesce(f->>'key','') !~ '^[-a-zA-Z0-9_.]{1,80}$' or coalesce(f->>'type','text') not in ('text','email','date','number','textarea')) or (select count(*) from jsonb_array_elements(fields))<>(select count(distinct f->>'key') from jsonb_array_elements(fields) f) then raise exception 'Template field definitions need unique keys and labels';end if;
  if nullif(item->>'document_type','') is null then raise exception 'Choose a document type';end if;
  k:='DOC_'||upper(regexp_replace(t.id,'[^a-zA-Z0-9]','_','g'));label:=t.name;
  insert into public.entity_onboarding_requirements(organization_id,onboarding_profile_id,requirement_code,requirement_type,label,required,status)
  values(e.organization_id,prof,k,'DOCUMENT',label,true,'PENDING') on conflict(onboarding_profile_id,requirement_code) do update set status='PENDING',document_id=null,updated_at=now() returning id into req;
  i:=i+1;
  if item->>'document_type'='RATE_AGREEMENT' then
   select coalesce(jsonb_agg(jsonb_build_object('service',c.name,'unit',r.unit,'rate',r.sell_rate,'currency',r.currency,'minimum',r.minimum_charge,'effective_from',r.effective_from,'effective_to',r.effective_to) order by c.name),'[]') into fields from public.customer_rate_agreements r join public.service_catalog c on c.id=r.service_id where r.organization_id=e.organization_id and r.customer_id=e.id and r.active;
   bindings:=bindings||jsonb_build_object('rate_sheet',fields);fields:=coalesce(t.design->'onboardingFields','[]');
  else bindings:=bindings-'rate_sheet';end if;
  insert into public.entity_onboarding_packet_documents(organization_id,packet_id,sort_order,document_type,title,template_id,template_version,template_snapshot,field_definitions,prefill,requirement_id)
  values(e.organization_id,pid,i,item->>'document_type',t.name,t.id,t.version,t.design,fields,bindings,req);
 end loop;
 return jsonb_build_object('id',pid,'token',token,'expires_at',now()+make_interval(days=>p_days));
end $$;
revoke all on function public.nodara_create_onboarding_packet(uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.nodara_create_onboarding_packet(uuid,text,text,jsonb,integer) to authenticated;

create or replace function public.nodara_review_onboarding_document(p_id uuid,p_approved boolean)
returns void language plpgsql security definer set search_path='' as $$
declare d public.entity_onboarding_packet_documents%rowtype;
begin
 select * into d from public.entity_onboarding_packet_documents where id=p_id for update;
 if auth.uid() is null or d.id is null or not public.nodara_is_org_member(d.organization_id) then raise exception 'Document access denied';end if;
 if d.submitted_at is null then raise exception 'Document has not been signed';end if;
 update public.entity_onboarding_packet_documents set review_status=case when p_approved then 'APPROVED' else 'REJECTED' end,reviewed_by=auth.uid(),reviewed_at=now() where id=d.id;
 update public.entity_onboarding_requirements set status=case when p_approved then 'SATISFIED' else 'PENDING' end,evidence=coalesce(evidence,'{}')||jsonb_build_object('review_status',case when p_approved then 'APPROVED' else 'REJECTED' end,'reviewed_by',auth.uid(),'reviewed_at',now()),updated_at=now() where id=d.requirement_id;
 if p_approved and d.document_type='CUSTOMER_INFORMATION' then
  update public.entity_legal_profiles set legal_name=coalesce(nullif(d.responses->>'customer.legal_name',''),legal_name),dba_name=coalesce(nullif(d.responses->>'customer.dba_name',''),dba_name),website=coalesce(nullif(d.responses->>'customer.website',''),website),updated_at=now() where entity_id=(select entity_id from public.entity_onboarding_packets where id=d.packet_id) and organization_id=d.organization_id;
 end if;
 update public.documents set metadata=metadata||jsonb_build_object('review_status',case when p_approved then 'APPROVED' else 'REJECTED' end),updated_at=now() where id=d.document_id;
end $$;
notify pgrst,'reload schema';

-- Preserve legacy custom templates when they came from a single workspace.
do $$declare oid uuid;begin
 if (select count(distinct organization_id) from public.organization_members)=1 then
  select organization_id into oid from public.organization_members limit 1;
  update public.document_templates set organization_id=oid where organization_id is null and builtin=false;
 end if;
end $$;
