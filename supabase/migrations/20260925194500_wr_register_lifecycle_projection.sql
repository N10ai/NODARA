create or replace function public.nodara_wr_register_states(p_organization_id uuid)
returns table(warehouse_receipt_id uuid,on_hand numeric,allocated numeric,uom text,lifecycle_state text,related_count bigint)
language sql stable security invoker set search_path=public as $$
with receipts as (select wr.id from public.warehouse_receipts wr where wr.organization_id=p_organization_id),
states as (select r.id,public.nodara_record_quantity_state(p_organization_id,'WR',r.id) s from receipts r),
rel as (select l.source_id id,count(*) related_count from public.operational_links l where l.organization_id=p_organization_id and l.active=true and l.source_type in ('WR','WAREHOUSE_RECEIPT') group by l.source_id)
select st.id,coalesce((st.s->>'on_hand')::numeric,0),coalesce((st.s->>'allocated')::numeric,0),coalesce(nullif(st.s->>'uom',''),'—'),coalesce(nullif(st.s->>'state',''),'ON_HAND'),coalesce(rel.related_count,0) from states st left join rel on rel.id=st.id;
$$;
grant execute on function public.nodara_wr_register_states(uuid) to authenticated;
