-- Review/apply workflow for customer instruction submissions.
alter table public.instruction_submissions add column if not exists applied_fields jsonb not null default '[]'::jsonb;
alter table public.instruction_submissions add column if not exists applied_at timestamptz;

create or replace function public.nodara_apply_instruction_submission(
 p_submission_id uuid,
 p_fields text[],
 p_review_notes text default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare sub instruction_submissions; req instruction_requests; s shipments; p jsonb; f text; structure text; movement text; applied text[]:='{}'; init jsonb;
begin
 select * into sub from instruction_submissions where id=p_submission_id for update;
 if sub.id is null then raise exception 'Submission not found'; end if;
 select * into req from instruction_requests where id=sub.request_id;
 if req.source_type<>'SHIPMENT' then raise exception 'Unsupported source type'; end if;
 select * into s from shipments where id=req.source_id for update;
 if s.id is null then raise exception 'Shipment not found'; end if;
 p:=sub.payload;

 foreach f in array coalesce(p_fields,'{}') loop
  case f
   when 'pieces' then update shipments set pieces=nullif(p->>'pieces','')::numeric,updated_at=now() where id=s.id;
   when 'weight' then update shipments set weight=nullif(p->>'weight','')::numeric,updated_at=now() where id=s.id;
   when 'shipper_name' then update shipments set shipper_name=nullif(p->>'shipper_name',''),updated_at=now() where id=s.id;
   when 'consignee_name' then update shipments set consignee_name=nullif(p->>'consignee_name',''),updated_at=now() where id=s.id;
   when 'structure' then
    structure:=coalesce(nullif(p->>'structure',''),'UNDECIDED');
    if structure<>'UNDECIDED' then
      movement:=case when structure='CONSOLIDATION' then 'CONSOLIDATION' else 'STRAIGHT' end;
      update shipments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('document_structure',case when structure='MASTER_ONLY' then 'MASTER_ONLY' when structure in ('HOUSE','CONSOLIDATION') then 'HOUSE' else structure end,'movement_type',movement,'instruction_submission_id',sub.id),updated_at=now() where id=s.id;
      select public.nodara_initialize_shipment_structure(s.id) into init;
    end if;
   when 'freight_terms' then update shipments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('freight_terms',p->>'freight_terms'),updated_at=now() where id=s.id;
   when 'other_charges' then update shipments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('other_charges_terms',p->>'other_charges'),updated_at=now() where id=s.id;
   when 'declared_carriage' then update shipments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('declared_value_carriage',p->>'declared_carriage'),updated_at=now() where id=s.id;
   when 'declared_customs' then update shipments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('declared_value_customs',p->>'declared_customs'),updated_at=now() where id=s.id;
   when 'commodity' then update shipments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commodity_description',p->>'commodity'),updated_at=now() where id=s.id;
   when 'handling' then update shipments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('handling_instructions',p->>'handling'),updated_at=now() where id=s.id;
   when 'house_shipper' then update shipment_houses set shipper_name=nullif(p->>'house_shipper',''),updated_at=now() where shipment_id=s.id;
   when 'house_consignee' then update shipment_houses set consignee_name=nullif(p->>'house_consignee',''),updated_at=now() where shipment_id=s.id;
   when 'house_notify' then update shipment_houses set notify_party_name=nullif(p->>'house_notify',''),updated_at=now() where shipment_id=s.id;
   else raise exception 'Unsupported apply field: %',f;
  end case;
  applied:=array_append(applied,f);
 end loop;

 update instruction_submissions set review_status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now(),review_notes=p_review_notes,applied_fields=to_jsonb(applied),applied_at=now() where id=sub.id;
 update instruction_requests set status='APPROVED',approved_at=now(),updated_at=now() where id=req.id;
 return jsonb_build_object('shipment_id',s.id,'submission_id',sub.id,'applied_fields',applied,'structure_result',init);
end $$;
revoke all on function public.nodara_apply_instruction_submission(uuid,text[],text) from public,anon;
grant execute on function public.nodara_apply_instruction_submission(uuid,text[],text) to authenticated;

create or replace function public.nodara_request_instruction_revision(p_submission_id uuid,p_notes text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare sub instruction_submissions; req instruction_requests;
begin
 select * into sub from instruction_submissions where id=p_submission_id for update;
 if sub.id is null then raise exception 'Submission not found'; end if;
 select * into req from instruction_requests where id=sub.request_id;
 update instruction_submissions set review_status='REVISION_REQUESTED',reviewed_by=auth.uid(),reviewed_at=now(),review_notes=p_notes where id=sub.id;
 update instruction_requests set status='REVISION_REQUESTED',updated_at=now() where id=req.id;
 return jsonb_build_object('request_id',req.id,'submission_id',sub.id,'status','REVISION_REQUESTED');
end $$;
revoke all on function public.nodara_request_instruction_revision(uuid,text) from public,anon;
grant execute on function public.nodara_request_instruction_revision(uuid,text) to authenticated;
