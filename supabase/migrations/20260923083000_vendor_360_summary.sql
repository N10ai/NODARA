create or replace function public.nodara_vendor_summary(p_organization_id uuid,p_vendor_id uuid)
returns jsonb language sql stable security invoker as $$
with ch as (
 select count(*)::int charge_count,
 coalesce(sum(coalesce(actual_buy_amount,estimated_buy_amount,0)),0) spend,
 count(*) filter(where coalesce(vendor_status,'NOT_REQUIRED') not in ('PAID','VOID','NOT_REQUIRED'))::int open_payables,
 coalesce(sum(coalesce(actual_buy_amount,estimated_buy_amount,0)) filter(where coalesce(vendor_status,'NOT_REQUIRED') not in ('PAID','VOID','NOT_REQUIRED')),0) open_payable_amount
 from public.operational_charges where organization_id=p_organization_id and vendor_id=p_vendor_id
), tos as (
 select count(*)::int total,
 count(*) filter(where status='DELIVERED')::int delivered,
 count(*) filter(where status not in ('DELIVERED','CANCELLED','VOID'))::int open
 from public.transport_orders where organization_id=p_organization_id and carrier_id=p_vendor_id
), sh as (
 select count(*)::int total from public.shipments where organization_id=p_organization_id and carrier_id=p_vendor_id
), docs as (
 select count(*)::int total from public.document_links where organization_id=p_organization_id and entity_id=p_vendor_id
)
select jsonb_build_object('charges',(select charge_count from ch),'spend',(select spend from ch),'open_payables',(select open_payables from ch),
'open_payable_amount',(select open_payable_amount from ch),'transport_orders',(select total from tos),'transport_delivered',(select delivered from tos),
'transport_open',(select open from tos),'shipments',(select total from sh),'documents',(select total from docs));
$$;