-- Planned FTZ receipts: admission may precede physical receiving.
create or replace function public.nodara_create_ftz_expected_receipt(p_admission_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_ref text; v_customer uuid; v_wr uuid; v_job uuid;
begin
 select organization_id,coalesce(source_reference,admission_number),customer_entity_id into v_org,v_ref,v_customer from public.ftz_admissions where id=p_admission_id;
 if v_org is null then raise exception 'FTZ admission not found'; end if;
 if not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 select (public.create_warehouse_receipt_shell_v1('FTZ_ADMISSION',v_ref,'FTZ_ADMISSION',p_admission_id,
   jsonb_build_object('source','FTZ_ADMISSION','admission_id',p_admission_id,'reference',v_ref))).warehouse_receipt_id into v_wr;
 select job_id into v_job from public.warehouse_receipts where id=v_wr;
 update public.warehouse_receipts set status='draft',processing_status='pending',started_at=null,
   expected_source_type='FTZ_ADMISSION',expected_source_id=p_admission_id,
   expected_snapshot=coalesce(expected_snapshot,'{}'::jsonb)||jsonb_build_object('admission_id',p_admission_id,'expected',true)
 where id=v_wr;
 if v_customer is not null then
   update public.jobs set customer_id=v_customer where id=v_job;
   update public.warehouse_receipts set identification_status='identified' where id=v_wr;
 end if;
 perform public.nodara_link_ftz_receipt(p_admission_id,v_wr);
 perform public.nodara_ftz_record_event(p_admission_id,'EXPECTED_WR_CREATED','Expected warehouse receipt created',
   (select receipt_number from public.warehouse_receipts where id=v_wr),'WAREHOUSE_RECEIPT',v_wr,jsonb_build_object('planned',true));
 return v_wr;
end $$;
revoke execute on function public.nodara_create_ftz_expected_receipt(uuid) from public,anon;
grant execute on function public.nodara_create_ftz_expected_receipt(uuid) to authenticated;

create or replace function public.nodara_ftz_admission_candidates(p_warehouse_receipt_id uuid,p_search text default null)
returns table(id uuid,admission_number text,source_reference text,admission_status text,identity_number text) language sql stable security definer set search_path=public as $$
 select a.id,a.admission_number,a.source_reference,a.admission_status,ii.identity_number
 from public.warehouse_receipts wr join public.ftz_admissions a on a.organization_id=wr.organization_id
 left join public.ftz_inventory_identities ii on ii.admission_id=a.id and ii.status='OPEN'
 where wr.id=p_warehouse_receipt_id and public.nodara_is_org_member(wr.organization_id)
 and not exists(select 1 from public.ftz_admission_receipts ar where ar.admission_id=a.id and ar.warehouse_receipt_id=wr.id)
 and (nullif(btrim(p_search),'') is null or a.admission_number ilike '%'||btrim(p_search)||'%' or coalesce(a.source_reference,'') ilike '%'||btrim(p_search)||'%')
 order by a.created_at desc limit 40
$$;
revoke execute on function public.nodara_ftz_admission_candidates(uuid,text) from public,anon;
grant execute on function public.nodara_ftz_admission_candidates(uuid,text) to authenticated;