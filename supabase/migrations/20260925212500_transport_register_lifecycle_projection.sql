create or replace function public.nodara_transport_register_states(p_organization_id uuid)
returns table(transport_order_id uuid,execution_state text,quantity numeric,uom text,upstream_count bigint,downstream_count bigint)
language sql stable security invoker set search_path=public as $$
with orders as (select t.id,t.status,t.pieces,t.actual_pickup_at,t.actual_delivery_at from transport_orders t where t.organization_id=p_organization_id),
up as (select target_id id,count(*) n from operational_links where organization_id=p_organization_id and active=true and target_type='TRANSPORT_ORDER' group by target_id),
down as (select source_id id,count(*) n from operational_links where organization_id=p_organization_id and active=true and source_type='TRANSPORT_ORDER' group by source_id)
select o.id,case when o.actual_delivery_at is not null or upper(coalesce(o.status,'')) in ('DELIVERED','COMPLETED','CLOSED') then 'DELIVERED' when o.actual_pickup_at is not null or upper(coalesce(o.status,'')) in ('PICKED_UP','IN_TRANSIT') then 'IN_TRANSIT' when upper(coalesce(o.status,''))='DISPATCHED' then 'DISPATCHED' when upper(coalesce(o.status,'')) in ('SCHEDULED','PLANNED','CONFIRMED') then 'SCHEDULED' when upper(coalesce(o.status,''))='CANCELLED' then 'CANCELLED' else 'REQUESTED' end,coalesce(o.pieces,0),'PCS',coalesce(up.n,0),coalesce(down.n,0) from orders o left join up on up.id=o.id left join down on down.id=o.id;
$$;
grant execute on function public.nodara_transport_register_states(uuid) to authenticated;