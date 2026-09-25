create or replace function public.nodara_link_transport_order_sources(p_transport_order_id uuid)
returns integer language plpgsql security invoker as $$
declare v_org uuid; v_count integer:=0;
begin
 select organization_id into v_org from public.transport_orders where id=p_transport_order_id;
 if v_org is null then raise exception 'Transport Order not found'; end if;

 update public.operational_links
 set active=false,updated_at=now()
 where organization_id=v_org and target_type='TRANSPORT_ORDER' and target_id=p_transport_order_id
   and relationship='TRANSPORTS' and coalesce(metadata->>'derived_from','')='transport_order_cargo';

 with src as(
  select upper(toc.source_type) source_type,toc.source_id,
         sum(coalesce(toc.quantity,0)) qty,
         case when count(distinct coalesce(toc.package_type,'PCS'))=1 then max(coalesce(toc.package_type,'PCS')) else 'MIXED' end uom
  from public.transport_order_cargo toc
  where toc.transport_order_id=p_transport_order_id
    and toc.source_id is not null
    and upper(coalesce(toc.source_type,'')) in('CARGO_RELEASE','CR')
  group by upper(toc.source_type),toc.source_id
 ), ins as(
  insert into public.operational_links(organization_id,source_type,source_id,target_type,target_id,relationship,metadata,active,updated_at)
  select v_org,'CARGO_RELEASE',source_id,'TRANSPORT_ORDER',p_transport_order_id,'TRANSPORTS',
         jsonb_build_object('quantity',qty,'uom',uom,'derived_from','transport_order_cargo'),true,now()
  from src
  on conflict (organization_id,source_type,source_id,target_type,target_id,relationship) where active=true
  do update set metadata=excluded.metadata,active=true,updated_at=now()
  returning 1
 )
 select count(*) into v_count from ins;
 return v_count;
end $$;