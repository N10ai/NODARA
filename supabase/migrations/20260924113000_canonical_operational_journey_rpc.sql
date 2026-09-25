create or replace function public.nodara_link_operational_records(p_organization_id uuid,p_source_type text,p_source_id uuid,p_target_type text,p_target_id uuid,p_relationship text default 'RELATED',p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker as $$
declare v_id uuid;
begin
 if p_source_id=p_target_id and upper(p_source_type)=upper(p_target_type) then raise exception 'A record cannot link to itself'; end if;
 insert into public.operational_links(organization_id,source_type,source_id,target_type,target_id,relationship,metadata,active,updated_at)
 values(p_organization_id,upper(p_source_type),p_source_id,upper(p_target_type),p_target_id,upper(coalesce(p_relationship,'RELATED')),coalesce(p_metadata,'{}'::jsonb),true,now())
 on conflict (organization_id,source_type,source_id,target_type,target_id,relationship) where active=true
 do update set metadata=public.operational_links.metadata||excluded.metadata,updated_at=now()
 returning id into v_id; return v_id;
end $$;

create or replace function public.nodara_operational_journey(p_organization_id uuid,p_record_type text,p_record_id uuid)
returns table(link_id uuid,direction text,relationship text,record_type text,record_id uuid,record_number text,record_status text,quantity numeric,uom text,created_at timestamptz) language sql stable security invoker as $$
with links as(
 select ol.id,case when upper(ol.source_type)=upper(p_record_type) and ol.source_id=p_record_id then 'DOWNSTREAM' else 'UPSTREAM' end direction,
 ol.relationship,
 case when upper(ol.source_type)=upper(p_record_type) and ol.source_id=p_record_id then upper(ol.target_type) else upper(ol.source_type) end rt,
 case when upper(ol.source_type)=upper(p_record_type) and ol.source_id=p_record_id then ol.target_id else ol.source_id end rid,
 ol.metadata,ol.created_at
 from public.operational_links ol where ol.organization_id=p_organization_id and ol.active=true and
 ((upper(ol.source_type)=upper(p_record_type) and ol.source_id=p_record_id) or (upper(ol.target_type)=upper(p_record_type) and ol.target_id=p_record_id))
)
select l.id,l.direction,l.relationship,l.rt,l.rid,
 case l.rt when 'WR' then wr.receipt_number when 'WAREHOUSE_RECEIPT' then wr.receipt_number when 'CR' then cr.release_number when 'CARGO_RELEASE' then cr.release_number when 'TRANSPORT_ORDER' then t.order_number when 'SHIPMENT' then s.shipment_number else null end,
 case l.rt when 'WR' then wr.status::text when 'WAREHOUSE_RECEIPT' then wr.status::text when 'CR' then cr.status when 'CARGO_RELEASE' then cr.status when 'TRANSPORT_ORDER' then t.status when 'SHIPMENT' then s.status else null end,
 nullif(l.metadata->>'quantity','')::numeric,l.metadata->>'uom',l.created_at
from links l
left join public.warehouse_receipts wr on l.rt in('WR','WAREHOUSE_RECEIPT') and wr.id=l.rid
left join public.cargo_releases cr on l.rt in('CR','CARGO_RELEASE') and cr.id=l.rid
left join public.transport_orders t on l.rt='TRANSPORT_ORDER' and t.id=l.rid
left join public.shipments s on l.rt='SHIPMENT' and s.id=l.rid
order by l.created_at;
$$;