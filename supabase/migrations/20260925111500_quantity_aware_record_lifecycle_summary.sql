-- Canonical quantity-aware lifecycle projection.
-- Record status remains separate from derived cargo/journey state.
create or replace function public.nodara_record_lifecycle_summary(p_organization_id uuid,p_record_type text,p_record_id uuid)
returns jsonb language plpgsql stable security invoker as $$
declare rt text:=upper(p_record_type); base_qty numeric:=0; allocated_qty numeric:=0; picked_qty numeric:=0; transit_qty numeric:=0; delivered_qty numeric:=0; available_qty numeric:=0; related_count int:=0; state text:='OPEN';
begin
 select count(*) into related_count from public.operational_links ol where ol.organization_id=p_organization_id and ol.active=true and ((upper(ol.source_type)=rt and ol.source_id=p_record_id) or (upper(ol.target_type)=rt and ol.target_id=p_record_id));
 if rt in ('CR','CARGO_RELEASE') then
   select coalesce(sum(requested_quantity),0),coalesce(sum(picked_quantity),0) into base_qty,picked_qty from public.cargo_release_lines where organization_id=p_organization_id and cargo_release_id=p_record_id;
   allocated_qty:=base_qty;
   select coalesce(sum(toc.quantity),0) into transit_qty from public.transport_order_cargo toc join public.transport_orders t on t.id=toc.transport_order_id and t.organization_id=p_organization_id where toc.organization_id=p_organization_id and upper(coalesce(toc.source_type,''))='CARGO_RELEASE' and toc.source_id=p_record_id and upper(coalesce(t.status,'')) in ('PICKED_UP','IN_TRANSIT','DISPATCHED');
   select coalesce(sum(toc.quantity),0) into delivered_qty from public.transport_order_cargo toc join public.transport_orders t on t.id=toc.transport_order_id and t.organization_id=p_organization_id where toc.organization_id=p_organization_id and upper(coalesce(toc.source_type,''))='CARGO_RELEASE' and toc.source_id=p_record_id and upper(coalesce(t.status,'')) in ('DELIVERED','COMPLETED');
   available_qty:=greatest(base_qty-picked_qty,0);
   state:=case when delivered_qty>0 and delivered_qty>=base_qty then 'DELIVERED' when delivered_qty>0 then 'PARTIALLY_DELIVERED' when transit_qty>0 then 'IN_TRANSIT' when picked_qty>0 and picked_qty<base_qty then 'PARTIALLY_PICKED' when picked_qty>=base_qty and base_qty>0 then 'PICKED' when allocated_qty>0 then 'ALLOCATED' else 'OPEN' end;
 elsif rt='TRANSPORT_ORDER' then
   select coalesce(sum(quantity),0) into base_qty from public.transport_order_cargo where organization_id=p_organization_id and transport_order_id=p_record_id;
   select case when upper(coalesce(status,'')) in ('DELIVERED','COMPLETED') then base_qty else 0 end,case when upper(coalesce(status,'')) in ('PICKED_UP','IN_TRANSIT','DISPATCHED') then base_qty else 0 end,upper(coalesce(status,'OPEN')) into delivered_qty,transit_qty,state from public.transport_orders where organization_id=p_organization_id and id=p_record_id;
 elsif rt='SHIPMENT' then
   select coalesce(pieces,0),upper(coalesce(status,'OPEN')) into base_qty,state from public.shipments where organization_id=p_organization_id and id=p_record_id;
 elsif rt in ('WR','WAREHOUSE_RECEIPT') then
   state:=(select upper(coalesce(status::text,'OPEN')) from public.warehouse_receipts where organization_id=p_organization_id and id=p_record_id);
 end if;
 return jsonb_build_object('record_type',rt,'record_id',p_record_id,'state',coalesce(state,'OPEN'),'quantity',base_qty,'available',available_qty,'allocated',allocated_qty,'picked',picked_qty,'in_transit',transit_qty,'delivered',delivered_qty,'related_records',related_count,'partial',(base_qty>0 and ((picked_qty>0 and picked_qty<base_qty) or (transit_qty>0 and transit_qty<base_qty) or (delivered_qty>0 and delivered_qty<base_qty))));
end $$;