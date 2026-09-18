-- FTZ operational receiving bridge: Admission -> WR -> reconciliation -> controlled inventory identity.
create or replace function public.nodara_link_ftz_receipt(
  p_admission_id uuid,
  p_warehouse_receipt_id uuid
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_wr_org uuid;
begin
  select organization_id into v_org from public.ftz_admissions where id=p_admission_id;
  if v_org is null then raise exception 'FTZ admission not found'; end if;
  if not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
  select organization_id into v_wr_org from public.warehouse_receipts where id=p_warehouse_receipt_id;
  if v_wr_org is null then raise exception 'Warehouse receipt not found'; end if;
  if v_wr_org<>v_org then raise exception 'Admission and WR must belong to the same workspace'; end if;
  insert into public.ftz_admission_receipts(organization_id,admission_id,warehouse_receipt_id)
  values(v_org,p_admission_id,p_warehouse_receipt_id) on conflict(admission_id,warehouse_receipt_id) do nothing;
  update public.ftz_admissions set admission_status=case when admission_status in ('PREPARING','AWAITING_DOCS','READY_TO_FILE','FILED','AUTHORIZED') then 'RECEIVING' else admission_status end,updated_at=now(),updated_by=auth.uid() where id=p_admission_id;
  return true;
end $$;
revoke execute on function public.nodara_link_ftz_receipt(uuid,uuid) from public,anon;
grant execute on function public.nodara_link_ftz_receipt(uuid,uuid) to authenticated;

create or replace function public.nodara_ftz_receipt_candidates(p_admission_id uuid,p_search text default null)
returns table(id uuid,receipt_number text,status text,created_at timestamptz) language sql stable security definer set search_path=public as $$
  select wr.id,wr.receipt_number,wr.status,wr.created_at
  from public.warehouse_receipts wr
  join public.ftz_admissions a on a.id=p_admission_id and a.organization_id=wr.organization_id
  where public.nodara_is_org_member(a.organization_id)
    and (nullif(btrim(p_search),'') is null or wr.receipt_number ilike '%'||btrim(p_search)||'%')
  order by wr.created_at desc limit 40
$$;
revoke execute on function public.nodara_ftz_receipt_candidates(uuid,text) from public,anon;
grant execute on function public.nodara_ftz_receipt_candidates(uuid,text) to authenticated;

create or replace function public.nodara_ftz_reconcile_admission(p_admission_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_identity uuid; v_open integer:=0; v_linked integer:=0;
begin
 select organization_id into v_org from public.ftz_admissions where id=p_admission_id for update;
 if v_org is null then raise exception 'FTZ admission not found'; end if;
 if not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 select id into v_identity from public.ftz_inventory_identities where admission_id=p_admission_id and status='OPEN' order by created_at limit 1;
 if v_identity is null then raise exception 'Admission has no open inventory identity'; end if;
 select count(*) into v_linked from public.ftz_admission_receipts where admission_id=p_admission_id;
 if v_linked=0 then raise exception 'Link at least one warehouse receipt before reconciliation'; end if;
 delete from public.ftz_admission_reconciliation where admission_id=p_admission_id;
 insert into public.ftz_admission_reconciliation(organization_id,admission_id,cargo_object_id,quantity_uom,expected_quantity,received_quantity,resolution_status)
 select v_org,p_admission_id,c.id,c.uom,coalesce(c.quantity,0),coalesce(c.quantity,0),'MATCHED'
 from public.ftz_admission_receipts ar
 join public.cargo_assignments ca on ca.transaction_type='WAREHOUSE_RECEIPT' and ca.transaction_id=ar.warehouse_receipt_id and ca.status='ASSIGNED'
 join public.cargo_objects c on c.id=ca.cargo_object_id and c.organization_id=v_org
 where ar.admission_id=p_admission_id
 on conflict do nothing;
 select count(*) into v_open from public.ftz_admission_reconciliation where admission_id=p_admission_id and resolution_status='OPEN';
 update public.ftz_admissions set admission_status=case when v_open=0 then 'RECONCILING' else 'SUSPENSE' end,updated_at=now(),updated_by=auth.uid() where id=p_admission_id;
 return jsonb_build_object('linked_receipts',v_linked,'open_variances',v_open);
end $$;
revoke execute on function public.nodara_ftz_reconcile_admission(uuid) from public,anon;
grant execute on function public.nodara_ftz_reconcile_admission(uuid) to authenticated;

create or replace function public.nodara_post_ftz_admission_inventory(p_admission_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_identity uuid; v_open integer; v_count integer;
begin
 select organization_id into v_org from public.ftz_admissions where id=p_admission_id for update;
 if v_org is null then raise exception 'FTZ admission not found'; end if;
 if not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 select count(*) into v_open from public.ftz_admission_reconciliation where admission_id=p_admission_id and resolution_status='OPEN';
 if v_open>0 then raise exception 'Resolve all receiving variances before posting FTZ inventory'; end if;
 select id into v_identity from public.ftz_inventory_identities where admission_id=p_admission_id and status='OPEN' order by created_at limit 1;
 if v_identity is null then raise exception 'Admission has no open inventory identity'; end if;
 insert into public.ftz_inventory_identity_cargo(organization_id,inventory_identity_id,cargo_object_id)
 select v_org,v_identity,r.cargo_object_id from public.ftz_admission_reconciliation r
 where r.admission_id=p_admission_id and r.cargo_object_id is not null and r.resolution_status in ('MATCHED','EXPLAINED','CORRECTED','ACCEPTED')
 on conflict(inventory_identity_id,cargo_object_id) do nothing;
 get diagnostics v_count=row_count;
 update public.ftz_admissions set admission_status='CLOSED',closed_at=now(),updated_at=now(),updated_by=auth.uid() where id=p_admission_id;
 update public.ftz_inventory_identities set status='CLOSED',closed_at=now() where id=v_identity;
 return v_count;
end $$;
revoke execute on function public.nodara_post_ftz_admission_inventory(uuid) from public,anon;
grant execute on function public.nodara_post_ftz_admission_inventory(uuid) to authenticated;

create or replace view public.ftz_admission_receipt_workspace with (security_invoker=true) as
select ar.admission_id,ar.warehouse_receipt_id,wr.receipt_number,wr.status receipt_status,wr.created_at receipt_created_at
from public.ftz_admission_receipts ar join public.warehouse_receipts wr on wr.id=ar.warehouse_receipt_id;
