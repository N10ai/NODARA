begin;
do $$
declare org uuid; member uuid; eid uuid; tid text:='choices-'||gen_random_uuid(); packet jsonb; view jsonb; token text; optional_id uuid; required_id uuid; count_before integer;
begin
 select organization_id,user_id into org,member from public.organization_members limit 1;
 perform set_config('request.jwt.claim.sub',member::text,true);
 eid:=public.nodara_save_entity_profile(jsonb_build_object('organization_id',org,'name','Document choice test','roles',jsonb_build_array('customer'),'email','owner@example.test'),'[]','[]',jsonb_build_object('legal_name','Choice Test LLC'));
 insert into public.document_templates(id,organization_id,name,status,placements,design)
 values(tid,org,'Optional information','published','[{"surface":"Onboarding"}]','{"objects":[{"type":"text","text":"Test information"}],"onboardingFields":[]}');
 insert into public.document_templates(id,organization_id,name,status,placements,design) select tid||'-required',org,'Required info',status,placements,design from public.document_templates where id=tid;
 packet:=public.nodara_create_onboarding_packet(eid,'Owner','owner@example.test',jsonb_build_array(jsonb_build_object('template_id',tid,'document_type','BILLING_INSTRUCTIONS','required',false),jsonb_build_object('template_id',tid||'-required','document_type','CUSTOMER_INFORMATION')));
 token:=packet->>'token';view:=public.nodara_onboarding_packet(token);
 optional_id:=(view->'documents'->0->>'id')::uuid;required_id:=(view->'documents'->1->>'id')::uuid;
 assert (view->'documents'->0->>'required')::boolean=false,'Optional choice not persisted';
 assert (view->'documents'->1->>'required')::boolean=true,'Legacy required default changed';
 assert (select count(*)=2 from public.entity_onboarding_packet_documents where packet_id=(packet->>'id')::uuid),'Unselected document added';
 assert not exists(select 1 from public.entity_onboarding_requirements r join public.entity_onboarding_profiles p on p.id=r.onboarding_profile_id where p.entity_id=eid and r.label ilike '%POA%'),'Excluded POA created a requirement';
 assert exists(select 1 from public.entity_onboarding_requirements r join public.entity_onboarding_packet_documents d on d.requirement_id=r.id where d.id=optional_id and not r.required),'Optional document blocks readiness';
 select count(*) into count_before from public.documents where entity_id=eid;
 execute 'set local role anon';
 begin
  perform public.nodara_onboarding_packet(token,jsonb_build_object('document_id',required_id,'skip',true));
  raise exception 'Sequence unexpectedly bypassed';
 exception when others then if sqlerrm<>'Complete the preceding document first' then raise;end if;end;
 view:=public.nodara_onboarding_packet(token,jsonb_build_object('document_id',optional_id,'skip',true));
 assert view->'documents'->0->>'skipped_at' is not null,'Optional skip missing';
 assert view->>'status'='OPEN','Required signature bypassed';
 begin
  perform public.nodara_onboarding_packet(token,jsonb_build_object('document_id',required_id,'skip',true));
  raise exception 'Required signature unexpectedly skipped';
 exception when others then if sqlerrm<>'This document is required and cannot be skipped' then raise;end if;end;
 view:=public.nodara_onboarding_packet(token,jsonb_build_object('document_id',required_id,'signer_name','Owner','signer_email','owner@example.test','signer_title','Owner','consent',true,'responses','{}'::jsonb));
 assert view->>'status'='COMPLETED','Skipped optional document blocked completion';
 perform public.nodara_onboarding_packet(token,jsonb_build_object('document_id',optional_id,'skip',true));
 execute 'reset role';
 assert (select document_id is null and submitted_at is null and skipped_at is not null from public.entity_onboarding_packet_documents where id=optional_id),'Skip created a signature record';
 assert (select count(*)=count_before+1 from public.documents where entity_id=eid),'Skipped document was archived as signed';
end $$;
rollback;
