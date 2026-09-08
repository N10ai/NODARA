create or replace function public.nodara_patch_transaction_operational_data(p_transaction_id uuid,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tx transactions%rowtype; v_next jsonb;
begin
 select * into v_tx from transactions where id=p_transaction_id;
 if not found then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(v_tx.organization_id) then raise exception 'Workspace access denied'; end if;
 v_next=coalesce(v_tx.operational_data,'{}'::jsonb)||coalesce(p_patch,'{}'::jsonb);
 update transactions set operational_data=v_next,updated_at=now() where id=p_transaction_id;
 perform public.nodara_record_activity(v_tx.id,'OPERATIONAL_DATA_UPDATED','TRANSACTION','Operational details updated',jsonb_build_object('patch',p_patch),jsonb_build_object('source_type','USER','surface','TRANSACTION_WORKSPACE'),null);
 return v_next;
end $$;

drop function if exists public.nodara_verify_wr_putaway_scan(uuid,text,text);
create function public.nodara_verify_wr_putaway_scan(p_transaction_id uuid,p_cargo_code text,p_location_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tx transactions%rowtype; v_wr warehouse_receipts%rowtype; v_c cargo_units%rowtype; v_loc warehouse_locations%rowtype; v_expected uuid;
begin
 select * into v_tx from transactions where id=p_transaction_id and transaction_type='WAREHOUSE_RECEIPT';
 if not found then raise exception 'Warehouse receipt transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(v_tx.organization_id) then raise exception 'Workspace access denied'; end if;
 select * into v_wr from warehouse_receipts where id=v_tx.domain_record_id;
 select * into v_c from cargo_units where organization_id=v_tx.organization_id and job_id=v_wr.job_id and parent_id is null and (id::text=btrim(p_cargo_code) or uin=btrim(p_cargo_code) or handling_unit_code=btrim(p_cargo_code) or coalesce(metadata->>'barcode','')=btrim(p_cargo_code)) limit 1;
 if v_c.id is null then raise exception 'Scanned cargo does not belong to this receipt'; end if;
 select * into v_loc from warehouse_locations where organization_id=v_tx.organization_id and active=true and (id::text=btrim(p_location_code) or lower(code)=lower(btrim(p_location_code))) limit 1;
 if v_loc.id is null then raise exception 'Warehouse location not found'; end if;
 v_expected=coalesce(v_c.warehouse_location_id,v_c.current_location_id);
 if v_expected is null then raise exception 'Assign a destination location before verifying put-away'; end if;
 if v_expected<>v_loc.id then raise exception 'Wrong location. Expected %, scanned %',(select code from warehouse_locations where id=v_expected),v_loc.code; end if;
 insert into workflow_events(organization_id,job_id,warehouse_receipt_id,cargo_unit_id,event_type,event_data,actor_id,created_at)
 values(v_tx.organization_id,v_wr.job_id,v_wr.id,v_c.id,'PUTAWAY_SCAN_VERIFIED',jsonb_build_object('cargo_code',p_cargo_code,'location_code',v_loc.code,'location_id',v_loc.id),auth.uid(),now());
 perform public.nodara_record_activity(v_tx.id,'PUTAWAY_SCAN_VERIFIED','WAREHOUSE_RECEIPT','Put-away scan verified',jsonb_build_object('cargo_unit_id',v_c.id,'location_id',v_loc.id,'location_code',v_loc.code),jsonb_build_object('source_type','SCAN','surface','WR_CARGO'),null);
 return jsonb_build_object('ok',true,'cargo_unit_id',v_c.id,'location_id',v_loc.id,'location_code',v_loc.code);
end $$;
grant execute on function public.nodara_verify_wr_putaway_scan(uuid,text,text) to authenticated;

create or replace function public.nodara_wr_auto_checklist(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tx transactions%rowtype; v_wr warehouse_receipts%rowtype; v_op jsonb; v_docs int; v_bol int; v_roots int; v_measured int; v_located int; v_scan int; v_photo_roots int; v_scale_roots int; v_items jsonb; v_complete text[]:=array[]::text[];
begin
 select * into v_tx from transactions where id=p_transaction_id and transaction_type='WAREHOUSE_RECEIPT'; if not found then raise exception 'WR transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(v_tx.organization_id) then raise exception 'Workspace access denied'; end if;
 select * into v_wr from warehouse_receipts where id=v_tx.domain_record_id; v_op=coalesce(v_tx.operational_data,'{}');
 select count(*) into v_docs from documents where transaction_id=v_tx.id and coalesce(is_current,true);
 select count(*) into v_bol from documents where transaction_id=v_tx.id and coalesce(is_current,true) and upper(coalesce(document_type,category,'')) in ('BOL','BILL_OF_LADING');
 select count(*) into v_roots from cargo_units where job_id=v_wr.job_id and parent_id is null;
 select count(*) into v_measured from cargo_units where job_id=v_wr.job_id and parent_id is null and weight_lb>0 and length_in>0 and width_in>0 and height_in>0;
 select count(*) into v_located from cargo_units where job_id=v_wr.job_id and parent_id is null and coalesce(warehouse_location_id,current_location_id) is not null;
 select count(distinct cargo_unit_id) into v_scan from workflow_events where warehouse_receipt_id=v_wr.id and event_type='PUTAWAY_SCAN_VERIFIED';
 select count(*) into v_photo_roots from (select cu.id from cargo_units cu where cu.job_id=v_wr.job_id and cu.parent_id is null and cu.cargo_object_id is not null and 4=(select count(distinct upper(d.metadata->>'photo_label')) from documents d where d.transaction_id=v_tx.id and d.cargo_object_id=cu.cargo_object_id and coalesce(d.is_current,true) and upper(coalesce(d.category,''))='PHOTO' and upper(coalesce(d.metadata->>'photo_label','')) in ('FRONT','BACK','LEFT','RIGHT'))) q;
 select count(*) into v_scale_roots from (select cu.id from cargo_units cu where cu.job_id=v_wr.job_id and cu.parent_id is null and cu.cargo_object_id is not null and exists(select 1 from documents d where d.transaction_id=v_tx.id and d.cargo_object_id=cu.cargo_object_id and coalesce(d.is_current,true) and upper(coalesce(d.category,''))='PHOTO' and upper(coalesce(d.metadata->>'photo_label',''))='WEIGHT_SCALE')) q;
 v_items=jsonb_build_array(
  jsonb_build_object('code','DRIVER','label','Driver identified','step','CHECK_IN','complete',coalesce(v_op->>'driver_name','')<>''),
  jsonb_build_object('code','DRIVER_ID','label','Driver ID verified','step','CHECK_IN','complete',coalesce(v_op->>'driver_id','')<>''),
  jsonb_build_object('code','STA','label','STA verified / not required','step','CHECK_IN','complete',coalesce(v_op->>'sta_status','') in ('VERIFIED','NOT_REQUIRED')),
  jsonb_build_object('code','TIME_IN','label','Time in captured','step','CHECK_IN','complete',coalesce(v_op->>'time_in','')<>''),
  jsonb_build_object('code','BOL','label','BOL captured','step','INSPECT','complete',coalesce(v_op->>'bol','')<>'' or v_bol>0),
  jsonb_build_object('code','CARGO','label','Cargo recorded','step','RECEIVE','complete',v_roots>0),
  jsonb_build_object('code','MEASURED','label','Top-level cargo measured','step','RECEIVE','complete',v_roots>0 and v_measured=v_roots,'detail',v_measured||' / '||v_roots),
  jsonb_build_object('code','PHOTOS','label','4-side cargo photos','step','RECEIVE','complete',v_roots>0 and v_photo_roots=v_roots,'detail',v_photo_roots||' / '||v_roots||' cargo units'),
  jsonb_build_object('code','WEIGHT_SCALE','label','Weight scale proof','step','RECEIVE','complete',v_roots>0 and v_scale_roots=v_roots,'detail',v_scale_roots||' / '||v_roots||' cargo units'),
  jsonb_build_object('code','LOCATION','label','Location assigned','step','PUT_AWAY','complete',v_roots>0 and v_located=v_roots),
  jsonb_build_object('code','SCAN','label','Put-away scan verified','step','PUT_AWAY','complete',v_roots>0 and v_scan=v_roots,'detail',v_scan||' / '||v_roots),
  jsonb_build_object('code','DOCS','label','Documents on file','step','NOTIFY','complete',v_docs>0),
  jsonb_build_object('code','TIME_OUT','label','Time out captured','step','NOTIFY','complete',coalesce(v_op->>'time_out','')<>'')
 );
 select coalesce(array_agg(distinct x->>'step'),'{}') into v_complete from jsonb_array_elements(v_items) x where (x->>'complete')::boolean and not exists(select 1 from jsonb_array_elements(v_items) y where y->>'step'=x->>'step' and not (y->>'complete')::boolean);
 insert into workflow_progress(organization_id,transaction_type,transaction_id,completed_steps,updated_at) values(v_tx.organization_id,'WAREHOUSE_RECEIPT',v_wr.id,to_jsonb(v_complete),now()) on conflict(organization_id,transaction_type,transaction_id) do update set completed_steps=excluded.completed_steps,updated_at=now();
 return jsonb_build_object('items',v_items,'completed_steps',to_jsonb(v_complete),'complete_count',(select count(*) from jsonb_array_elements(v_items) x where (x->>'complete')::boolean),'total_count',jsonb_array_length(v_items));
end $$;
grant execute on function public.nodara_wr_auto_checklist(uuid) to authenticated;
