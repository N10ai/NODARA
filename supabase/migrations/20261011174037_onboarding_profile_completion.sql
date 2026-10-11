create or replace function public.nodara_review_onboarding_document(p_id uuid,p_approved boolean)
returns void language plpgsql security definer set search_path='' as $$
declare d public.entity_onboarding_packet_documents%rowtype; eid uuid; cid uuid; aid uuid;
begin
 select * into d from public.entity_onboarding_packet_documents where id=p_id for update;
 if auth.uid() is null or d.id is null or not public.nodara_is_org_member(d.organization_id) then raise exception 'Document access denied';end if;
 if d.submitted_at is null then raise exception 'Document has not been signed';end if;
 if not exists(select 1 from public.entity_onboarding_requirements where id=d.requirement_id and document_id=d.document_id) then raise exception 'This document has been superseded by a newer request';end if;
 select entity_id into eid from public.entity_onboarding_packets where id=d.packet_id;
 update public.entity_onboarding_packet_documents set review_status=case when p_approved then 'APPROVED' else 'REJECTED' end,reviewed_by=auth.uid(),reviewed_at=now() where id=d.id;
 update public.entity_onboarding_requirements set status=case when p_approved then 'SATISFIED' else 'PENDING' end,evidence=coalesce(evidence,'{}')||jsonb_build_object('review_status',case when p_approved then 'APPROVED' else 'REJECTED' end,'reviewed_by',auth.uid(),'reviewed_at',now()),updated_at=now() where id=d.requirement_id;
 if p_approved and d.document_type='CUSTOMER_INFORMATION' then
  update public.entities set email=coalesce(nullif(d.responses->>'customer.email',''),email),phone=coalesce(nullif(d.responses->>'customer.phone',''),phone),updated_at=now() where id=eid and organization_id=d.organization_id;
  if nullif(d.responses->>'contact.name','') is not null then
   select id into cid from public.entity_contacts where entity_id=eid and organization_id=d.organization_id and active and is_primary order by created_at limit 1;
   if cid is null then insert into public.entity_contacts(organization_id,entity_id,name,email,phone,roles,is_primary) values(d.organization_id,eid,d.responses->>'contact.name',d.responses->>'contact.email',d.responses->>'contact.phone',array['operations'],true);
   else update public.entity_contacts set name=d.responses->>'contact.name',email=coalesce(nullif(d.responses->>'contact.email',''),email),phone=coalesce(nullif(d.responses->>'contact.phone',''),phone),updated_at=now() where id=cid;end if;
  end if;
  if nullif(d.responses->>'billing.address','') is not null then
   select id into aid from public.entity_addresses where entity_id=eid and organization_id=d.organization_id and active and upper(address_type)='BILLING' order by is_primary desc,created_at limit 1;
   if aid is null then insert into public.entity_addresses(organization_id,entity_id,address_type,line1,city,state_region,postal_code,country_code) values(d.organization_id,eid,'BILLING',d.responses->>'billing.address',d.responses->>'billing.city',d.responses->>'billing.state',d.responses->>'billing.postal',d.responses->>'billing.country');
   else update public.entity_addresses set line1=d.responses->>'billing.address',city=coalesce(nullif(d.responses->>'billing.city',''),city),state_region=coalesce(nullif(d.responses->>'billing.state',''),state_region),postal_code=coalesce(nullif(d.responses->>'billing.postal',''),postal_code),country_code=coalesce(nullif(d.responses->>'billing.country',''),country_code),updated_at=now() where id=aid;end if;
  end if;
  update public.entity_legal_profiles set legal_name=coalesce(nullif(d.responses->>'customer.legal_name',''),legal_name),dba_name=coalesce(nullif(d.responses->>'customer.dba_name',''),dba_name),website=coalesce(nullif(d.responses->>'customer.website',''),website),updated_at=now() where entity_id=(select entity_id from public.entity_onboarding_packets where id=d.packet_id) and organization_id=d.organization_id;
 end if;
 update public.documents set metadata=metadata||jsonb_build_object('review_status',case when p_approved then 'APPROVED' else 'REJECTED' end),updated_at=now() where id=d.document_id;
end $$;
notify pgrst,'reload schema';
