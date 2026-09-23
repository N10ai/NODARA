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
 select count(*)::int charges, coalesce(sum(sell_amount),0) amount,
 count(*) filter(where billing_status='UNBILLED')::int unbilled
 from public.operational_charges where organization_id=p_organization_id and customer_id=p_customer_id
), docs as (
 select count(*)::int n from public.document_links where organization_id=p_organization_id and entity_id=p_customer_id
), rates as (
 select count(*) filter(where active)::int n from public.customer_rate_agreements where organization_id=p_organization_id and customer_id=p_customer_id
)
select jsonb_build_object(
 'warehouse_receipts',(select n from wr),'cargo_releases',(select n from cr),'shipments',(select n from sh),'transport_orders',(select n from tr),
 'transactions',(select n from wr)+(select n from cr)+(select n from sh)+(select n from tr),
 'charges',(select charges from ch),'charge_amount',(select amount from ch),'unbilled_charges',(select unbilled from ch),
 'documents',(select n from docs),'active_rates',(select n from rates)
); $$;