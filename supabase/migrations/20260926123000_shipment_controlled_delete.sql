create or replace function public.nodara_delete_shipment(p_shipment_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_shipment public.shipments%rowtype; v_protected integer; v_drafts integer; v_houses integer;
begin
 select * into v_shipment from public.shipments where id=p_shipment_id for update;
 if not found then raise exception 'Shipment not found'; end if;
 select count(*) into v_protected from public.shipment_document_issues where shipment_id=p_shipment_id and status in ('ISSUED','VOID');
 if v_protected>0 then raise exception 'This shipment has issued or voided document history and cannot be permanently deleted. Cancel/void the shipment instead.'; end if;
 select count(*) into v_drafts from public.shipment_document_issues where shipment_id=p_shipment_id;
 select count(*) into v_houses from public.shipment_houses where shipment_id=p_shipment_id;
 delete from public.shipment_document_issues where shipment_id=p_shipment_id;
 delete from public.shipment_houses where shipment_id=p_shipment_id;
 delete from public.shipments where id=p_shipment_id;
 return jsonb_build_object('deleted',true,'shipment_id',p_shipment_id,'shipment_number',v_shipment.shipment_number,'draft_document_revisions_deleted',v_drafts,'draft_houses_deleted',v_houses);
end $$;
revoke all on function public.nodara_delete_shipment(uuid) from public,anon;
grant execute on function public.nodara_delete_shipment(uuid) to authenticated;