create or replace function public.nodara_customer_summary(p_organization_id uuid,p_customer_id uuid)
returns jsonb language sql stable security invoker as $$
with wr as (
 select count(*)::int n from public.warehouse_receipts w join public.jobs j on j.id=w.job_id where w.organization_id=p_organization_id and j.customer_id=p_customer_id
), cr as (
 select count(*)::int n from public.cargo_releases where organization_id=p_organization_id and customer_id=p_customer_id
), sh as (
 select count(*)::int n from public.shipments where organization_id=p_organization_id and customer_id=p_customer_id
), tr as (
 select count(*)::int n from public.transport_orders where organization_id=p_organization_id and customer_id=p_customer_id
), ch as (
 select count(*)::int charges,coalesce(sum(sell_amount),0) amount,
 count(*) filter(where coalesce(billing_status,'UNBILLED')='UNBILLED')::int unbilled,
 coalesce(sum(sell_amount) filter(where coalesce(billing_status,'UNBILLED')='UNBILLED'),0) unbilled_amount
 from public.operational_charges where organization_id=p_organization_id and customer_id=p_customer_id
), docs as (
 select count(*)::int n from public.document_links where organization_id=p_organization_id and entity_id=p_customer_id
), rates as (
 select count(*) filter(where active)::int n from public.customer_rate_agreements where organization_id=p_organization_id and customer_id=p_customer_id
), inv as (
 select coalesce(sum(b.quantity_base),0) qty,coalesce(sum(b.quantity_reserved),0) reserved,
 count(distinct coalesce(b.warehouse_location_id,b.location_id)) filter(where b.quantity_base>0)::int locations
 from public.inventory_balances b join public.inventory_items i on i.id=b.inventory_item_id
 where b.organization_id=p_organization_id and coalesce(i.owner_entity_id,i.entity_id)=p_customer_id
), cargo as (
 select count(*) filter(where c.parent_cargo_id is null and c.warehouse_location_id is not null and coalesce(c.status,'') not in ('RELEASED','DELIVERED','VOID','CANCELLED'))::int handling_units,
 coalesce(sum(c.volume_cbm) filter(where c.parent_cargo_id is null and c.warehouse_location_id is not null and coalesce(c.status,'') not in ('RELEASED','DELIVERED','VOID','CANCELLED')),0) cbm,
 coalesce(sum(c.gross_weight) filter(where c.parent_cargo_id is null and c.warehouse_location_id is not null and coalesce(c.status,'') not in ('RELEASED','DELIVERED','VOID','CANCELLED')),0) gross_weight
 from public.cargo_objects c where c.organization_id=p_organization_id and c.owner_entity_id=p_customer_id
)
select jsonb_build_object(
 'warehouse_receipts',(select n from wr),'cargo_releases',(select n from cr),'shipments',(select n from sh),'transport_orders',(select n from tr),
 'transactions',(select n from wr)+(select n from cr)+(select n from sh)+(select n from tr),
 'charges',(select charges from ch),'charge_amount',(select amount from ch),'unbilled_charges',(select unbilled from ch),'unbilled_amount',(select unbilled_amount from ch),
 'documents',(select n from docs),'active_rates',(select n from rates),
 'inventory_quantity',(select qty from inv),'reserved_quantity',(select reserved from inv),'locations_used',(select locations from inv),
 'handling_units_on_hand',(select handling_units from cargo),'on_hand_cbm',(select cbm from cargo),'on_hand_gross_weight',(select gross_weight from cargo)
); $$;