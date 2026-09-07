-- Reproducibility/backfill for generic projections and cargo measurement sync.

-- Re-run domain rows through projection sync on migration without relying on trigger ordering.
insert into public.transaction_parties(organization_id,transaction_id,role_code,entity_id,party_name_snapshot,is_primary,source,provenance)
select s.organization_id,t.id,x.role_code,x.entity_id,e.name,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())
from public.shipments s join public.transactions t on t.organization_id=s.organization_id and t.transaction_type='SHIPMENT' and t.domain_record_id=s.id
cross join lateral (values ('CUSTOMER',s.customer_id),('SHIPPER',s.shipper_id),('CONSIGNEE',s.consignee_id),('CARRIER',s.carrier_id)) x(role_code,entity_id)
left join public.entities e on e.id=x.entity_id where x.entity_id is not null on conflict do nothing;

insert into public.transaction_parties(organization_id,transaction_id,role_code,entity_id,party_name_snapshot,is_primary,source,provenance)
select c.organization_id,t.id,x.role_code,x.entity_id,e.name,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())
from public.cargo_releases c join public.transactions t on t.organization_id=c.organization_id and t.transaction_type='CARGO_RELEASE' and t.domain_record_id=c.id
cross join lateral (values ('CUSTOMER',c.customer_id),('CONSIGNEE',c.consignee_id),('CARRIER',c.carrier_id)) x(role_code,entity_id)
left join public.entities e on e.id=x.entity_id where x.entity_id is not null on conflict do nothing;

insert into public.transaction_parties(organization_id,transaction_id,role_code,entity_id,party_name_snapshot,is_primary,source,provenance)
select o.organization_id,t.id,x.role_code,x.entity_id,e.name,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())
from public.transport_orders o join public.transactions t on t.organization_id=o.organization_id and t.transaction_type='TRANSPORT_ORDER' and t.domain_record_id=o.id
cross join lateral (values ('CUSTOMER',o.customer_id),('CARRIER',o.carrier_id),('PICKUP_LOCATION',o.pickup_entity_id),('DELIVERY_LOCATION',o.delivery_entity_id)) x(role_code,entity_id)
left join public.entities e on e.id=x.entity_id where x.entity_id is not null on conflict do nothing;

insert into public.transaction_references(organization_id,transaction_id,reference_type,reference_value,is_primary,source,provenance)
select s.organization_id,t.id,x.reference_type,x.reference_value,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())
from public.shipments s join public.transactions t on t.organization_id=s.organization_id and t.transaction_type='SHIPMENT' and t.domain_record_id=s.id
cross join lateral (values ('CUSTOMER_REFERENCE',s.reference),('MASTER_REFERENCE',s.master_reference),('HOUSE_REFERENCE',s.house_reference),('BOOKING',s.booking_reference)) x(reference_type,reference_value)
where nullif(btrim(x.reference_value),'') is not null on conflict do nothing;

insert into public.transaction_references(organization_id,transaction_id,reference_type,reference_value,is_primary,source,provenance)
select c.organization_id,t.id,'CUSTOMER_REFERENCE',c.reference,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())
from public.cargo_releases c join public.transactions t on t.organization_id=c.organization_id and t.transaction_type='CARGO_RELEASE' and t.domain_record_id=c.id
where nullif(btrim(c.reference),'') is not null on conflict do nothing;

insert into public.transaction_references(organization_id,transaction_id,reference_type,reference_value,is_primary,source,provenance)
select o.organization_id,t.id,x.reference_type,x.reference_value,true,'DOMAIN_PROJECTION',jsonb_build_object('source_type','SYSTEM','captured_at',now())
from public.transport_orders o join public.transactions t on t.organization_id=o.organization_id and t.transaction_type='TRANSPORT_ORDER' and t.domain_record_id=o.id
cross join lateral (values ('CUSTOMER_REFERENCE',o.customer_reference),('CARRIER_REFERENCE',o.carrier_reference)) x(reference_type,reference_value)
where nullif(btrim(x.reference_value),'') is not null on conflict do nothing;

create or replace function public.nodara_guard_cargo_object()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_parent_org uuid; v_owner_org uuid; v_type text;
begin
 if auth.uid() is not null and not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 if coalesce(new.quantity,0)<0 then raise exception 'Cargo quantity cannot be negative'; end if;
 if upper(coalesce(new.source_type,''))='TRANSACTION' and coalesce(new.quantity,0)<=0 then raise exception 'Transaction cargo quantity must be greater than zero'; end if;
 if coalesce(new.gross_weight,0)<0 or coalesce(new.length,0)<0 or coalesce(new.width,0)<0 or coalesce(new.height,0)<0 or coalesce(new.volume_cbm,0)<0 then raise exception 'Cargo measurements cannot be negative'; end if;
 if new.parent_cargo_id is not null then select organization_id into v_parent_org from public.cargo_objects where id=new.parent_cargo_id; if v_parent_org is null then raise exception 'Parent cargo object not found'; end if; if v_parent_org<>new.organization_id then raise exception 'Parent cargo belongs to a different workspace'; end if; end if;
 if new.owner_entity_id is not null then select organization_id into v_owner_org from public.entities where id=new.owner_entity_id; if v_owner_org is null or v_owner_org<>new.organization_id then raise exception 'Cargo owner entity belongs to a different workspace'; end if; end if;
 if upper(coalesce(new.source_type,''))='TRANSACTION' then v_type:=upper(coalesce(new.metadata->>'transaction_type','')); perform public.nodara_assert_transaction_target(new.organization_id,v_type,new.source_id); end if;
 new.updated_at:=now(); return new;
end $$;

create or replace function public.nodara_sync_cargo_unit_object()
returns trigger language plpgsql security definer set search_path=public as $$
declare j jsonb:=to_jsonb(new); v_org uuid:=nullif(j->>'organization_id','')::uuid; v_source uuid; v_parent uuid:=nullif(coalesce(j->>'parent_id',j->>'parent_cargo_id'),'')::uuid;
begin
 v_source:=nullif(coalesce(j->>'warehouse_receipt_id',j->>'receipt_id',j->'metadata'->>'warehouse_receipt_id'),'')::uuid;
 if v_source is null and nullif(j->>'job_id','') is not null then select wr.id into v_source from public.warehouse_receipts wr where wr.job_id=nullif(j->>'job_id','')::uuid order by wr.created_at desc limit 1; end if;
 new.cargo_object_id:=new.id;
 insert into public.cargo_objects(id,organization_id,cargo_code,source_type,source_id,parent_cargo_id,package_type,quantity,uom,description,gross_weight,weight_unit,length,width,height,dimension_unit,volume_cbm,status,metadata,dimension_basis,gross_weight_basis,measurement_status,updated_at)
 values(new.id,v_org,coalesce(j->>'uin',j->>'cargo_code',j->>'handling_unit_code',j->>'handling_unit_id'),case when v_source is null then 'DIRECT' else 'WAREHOUSE_RECEIPT' end,v_source,case when v_parent is not null and exists(select 1 from public.cargo_objects where id=v_parent) then v_parent else null end,coalesce(j->>'package_type',j->>'type'),coalesce(nullif(j->>'quantity','')::numeric,1),coalesce(j->>'uom',j->>'unit'),coalesce(j->>'description',j->>'commodity'),nullif(coalesce(j->>'gross_weight',j->>'weight',j->>'weight_lb'),'')::numeric,coalesce(j->>'weight_unit','LB'),nullif(coalesce(j->>'length',j->>'length_in'),'')::numeric,nullif(coalesce(j->>'width',j->>'width_in'),'')::numeric,nullif(coalesce(j->>'height',j->>'height_in'),'')::numeric,coalesce(j->>'dimension_unit','IN'),nullif(j->>'volume_cbm','')::numeric,coalesce(j->>'status','AVAILABLE'),jsonb_build_object('legacy_cargo_unit_id',new.id,'warehouse_receipt_id',v_source),coalesce(j->>'dimension_basis','PER_UNIT'),coalesce(j->>'gross_weight_basis','LINE_TOTAL'),coalesce(j->>'measurement_status','UNVERIFIED'),now())
 on conflict(id) do update set cargo_code=excluded.cargo_code,source_type=excluded.source_type,source_id=excluded.source_id,parent_cargo_id=coalesce(excluded.parent_cargo_id,cargo_objects.parent_cargo_id),package_type=excluded.package_type,quantity=excluded.quantity,uom=excluded.uom,description=excluded.description,gross_weight=excluded.gross_weight,weight_unit=excluded.weight_unit,length=excluded.length,width=excluded.width,height=excluded.height,dimension_unit=excluded.dimension_unit,volume_cbm=excluded.volume_cbm,status=excluded.status,dimension_basis=excluded.dimension_basis,gross_weight_basis=excluded.gross_weight_basis,measurement_status=excluded.measurement_status,metadata=coalesce(cargo_objects.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();
 return new;
end $$;
