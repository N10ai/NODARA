alter table public.ftz_admission_reconciliation add column if not exists expected_cargo_id uuid references public.ftz_expected_cargo(id) on delete set null;
alter table public.ftz_admission_reconciliation add column if not exists match_method text;
alter table public.ftz_admission_reconciliation add column if not exists match_confidence numeric;
alter table public.ftz_admission_reconciliation add column if not exists variance_type text;

create or replace function public.nodara_ftz_reconcile_admission(p_admission_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_identity uuid;v_open int:=0;v_linked int:=0;v_expected int:=0;v_received int:=0;
begin
 select organization_id into v_org from ftz_admissions where id=p_admission_id for update;
 if v_org is null then raise exception 'FTZ admission not found';end if;
 if not nodara_is_org_member(v_org) then raise exception 'Workspace access denied';end if;
 select id into v_identity from ftz_inventory_identities where admission_id=p_admission_id and status='OPEN' order by created_at limit 1;
 if v_identity is null then raise exception 'Admission has no open inventory identity';end if;
 select count(*) into v_linked from ftz_admission_receipts where admission_id=p_admission_id;
 if v_linked=0 then raise exception 'Link at least one warehouse receipt before reconciliation';end if;
 select count(*) into v_expected from ftz_expected_cargo where admission_id=p_admission_id;
 if v_expected=0 then raise exception 'Add expected cargo before reconciliation';end if;
 delete from ftz_admission_reconciliation where admission_id=p_admission_id;

 with actual as (
  select c.*,row_number() over(order by c.created_at,c.id) rn
  from ftz_admission_receipts ar join cargo_assignments ca on ca.transaction_type='WAREHOUSE_RECEIPT' and ca.transaction_id=ar.warehouse_receipt_id and ca.status='ASSIGNED'
  join cargo_objects c on c.id=ca.cargo_object_id and c.organization_id=v_org where ar.admission_id=p_admission_id
 ), candidates as (
  select e.id expected_id,a.id actual_id,
   case when nullif(lower(e.part_number),'') is not null and lower(e.part_number)=lower(coalesce(a.metadata->>'part_number',a.metadata->>'sku','')) then 100
        when nullif(lower(e.description),'') is not null and lower(e.description)=lower(coalesce(a.description,'')) then 80
        when upper(coalesce(e.package_type,''))=upper(coalesce(a.package_type,'')) and upper(e.uom)=upper(a.uom) then 50 else 10 end score,
   row_number() over(partition by e.id order by
    case when nullif(lower(e.part_number),'') is not null and lower(e.part_number)=lower(coalesce(a.metadata->>'part_number',a.metadata->>'sku','')) then 100
         when nullif(lower(e.description),'') is not null and lower(e.description)=lower(coalesce(a.description,'')) then 80
         when upper(coalesce(e.package_type,''))=upper(coalesce(a.package_type,'')) and upper(e.uom)=upper(a.uom) then 50 else 10 end desc,a.created_at) pick
  from ftz_expected_cargo e cross join actual a where e.admission_id=p_admission_id
 ), picked as (select * from candidates where pick=1),
 matched as (
  select e.*,a.id actual_id,a.quantity actual_qty,a.uom actual_uom,p.score
  from ftz_expected_cargo e left join picked p on p.expected_id=e.id left join actual a on a.id=p.actual_id where e.admission_id=p_admission_id
 )
 insert into ftz_admission_reconciliation(organization_id,admission_id,expected_cargo_id,cargo_object_id,quantity_uom,expected_quantity,received_quantity,variance_quantity,resolution_status,match_method,match_confidence,variance_type)
 select v_org,p_admission_id,id,actual_id,coalesce(actual_uom,uom),quantity,coalesce(actual_qty,0),coalesce(actual_qty,0)-quantity,
 case when actual_id is null or upper(coalesce(actual_uom,''))<>upper(coalesce(uom,'')) or coalesce(actual_qty,0)<>quantity then 'OPEN' else 'MATCHED' end,
 case when score=100 then 'PART_NUMBER' when score=80 then 'DESCRIPTION' when score=50 then 'PACKAGE_UOM' when score is null then 'UNMATCHED' else 'HEURISTIC' end,
 coalesce(score,0),
 case when actual_id is null then 'SHORT' when upper(coalesce(actual_uom,''))<>upper(coalesce(uom,'')) then 'UOM_MISMATCH' when actual_qty<quantity then 'SHORT' when actual_qty>quantity then 'OVER' else 'NONE' end
 from matched;

 insert into ftz_admission_reconciliation(organization_id,admission_id,cargo_object_id,quantity_uom,expected_quantity,received_quantity,variance_quantity,resolution_status,match_method,match_confidence,variance_type)
 select v_org,p_admission_id,a.id,a.uom,0,a.quantity,a.quantity,'OPEN','UNEXPECTED',0,'UNEXPECTED'
 from (
  select distinct c.* from ftz_admission_receipts ar join cargo_assignments ca on ca.transaction_type='WAREHOUSE_RECEIPT' and ca.transaction_id=ar.warehouse_receipt_id and ca.status='ASSIGNED'
  join cargo_objects c on c.id=ca.cargo_object_id and c.organization_id=v_org where ar.admission_id=p_admission_id
 ) a where not exists(select 1 from ftz_admission_reconciliation r where r.admission_id=p_admission_id and r.cargo_object_id=a.id);

 select count(*) into v_received from ftz_admission_reconciliation where admission_id=p_admission_id and cargo_object_id is not null;
 select count(*) into v_open from ftz_admission_reconciliation where admission_id=p_admission_id and resolution_status='OPEN';
 update ftz_admissions set admission_status=case when v_open=0 then 'RECONCILING' else 'SUSPENSE' end,updated_at=now(),updated_by=auth.uid() where id=p_admission_id;
 perform nodara_ftz_record_event(p_admission_id,'RECONCILIATION_RUN','Receiving reconciled',v_open||' open variance(s)','ADMISSION',p_admission_id,jsonb_build_object('expected_lines',v_expected,'received_lines',v_received,'open_variances',v_open));
 return jsonb_build_object('linked_receipts',v_linked,'expected_lines',v_expected,'received_lines',v_received,'open_variances',v_open);
end $$;

create or replace function public.nodara_resolve_ftz_variance(p_reconciliation_id uuid,p_note text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_adm uuid;
begin
 select organization_id,admission_id into v_org,v_adm from ftz_admission_reconciliation where id=p_reconciliation_id;
 if v_org is null or not nodara_is_org_member(v_org) then raise exception 'Workspace access denied';end if;
 if nullif(btrim(p_note),'') is null then raise exception 'Resolution note is required';end if;
 update ftz_admission_reconciliation set resolution_status='RESOLVED',resolution_note=btrim(p_note),resolved_at=now(),resolved_by=auth.uid(),updated_at=now() where id=p_reconciliation_id;
 perform nodara_ftz_record_event(v_adm,'VARIANCE_RESOLVED','Variance resolved',btrim(p_note),'RECONCILIATION',p_reconciliation_id,'{}'::jsonb);
 return true;
end $$;
revoke execute on function public.nodara_resolve_ftz_variance(uuid,text) from public,anon;
grant execute on function public.nodara_resolve_ftz_variance(uuid,text) to authenticated;