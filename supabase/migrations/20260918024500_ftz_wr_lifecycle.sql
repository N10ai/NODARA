-- Improve FTZ <-> Warehouse Receipt lifecycle.
create or replace function public.nodara_unlink_ftz_receipt(p_admission_id uuid,p_warehouse_receipt_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_deleted boolean;
begin
 select organization_id into v_org from public.ftz_admissions where id=p_admission_id;
 if v_org is null then raise exception 'FTZ admission not found'; end if;
 if not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 if exists(select 1 from public.ftz_inventory_identity_cargo iic join public.ftz_inventory_identities ii on ii.id=iic.inventory_identity_id where ii.admission_id=p_admission_id) then
   raise exception 'WR cannot be unlinked after FTZ inventory has been posted. Reverse the inventory transaction first.';
 end if;
 delete from public.ftz_admission_reconciliation where admission_id=p_admission_id and cargo_object_id in (
   select ca.cargo_object_id from public.cargo_assignments ca where ca.transaction_type='WAREHOUSE_RECEIPT' and ca.transaction_id=p_warehouse_receipt_id
 );
 delete from public.ftz_admission_receipts where admission_id=p_admission_id and warehouse_receipt_id=p_warehouse_receipt_id returning true into v_deleted;
 if coalesce(v_deleted,false) then
   perform public.nodara_ftz_record_event(p_admission_id,'WR_UNLINKED','Warehouse receipt unlinked',null,'WAREHOUSE_RECEIPT',p_warehouse_receipt_id,jsonb_build_object('warehouse_receipt_id',p_warehouse_receipt_id));
 end if;
 return coalesce(v_deleted,false);
end $$;
revoke execute on function public.nodara_unlink_ftz_receipt(uuid,uuid) from public,anon;
grant execute on function public.nodara_unlink_ftz_receipt(uuid,uuid) to authenticated;

create or replace function public.nodara_delete_ftz_receipt(p_admission_id uuid,p_warehouse_receipt_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_count int;
begin
 select organization_id into v_org from public.ftz_admissions where id=p_admission_id;
 if v_org is null or not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 select count(*) into v_count from public.ftz_admission_receipts where warehouse_receipt_id=p_warehouse_receipt_id and admission_id<>p_admission_id;
 if v_count>0 then raise exception 'WR is linked to another FTZ admission and cannot be deleted here.'; end if;
 perform public.nodara_unlink_ftz_receipt(p_admission_id,p_warehouse_receipt_id);
 perform public.delete_warehouse_receipt(p_warehouse_receipt_id);
 return true;
end $$;
revoke execute on function public.nodara_delete_ftz_receipt(uuid,uuid) from public,anon;
grant execute on function public.nodara_delete_ftz_receipt(uuid,uuid) to authenticated;