create or replace function public.nodara_cr_register_states(p_organization_id uuid)
returns table(cargo_release_id uuid,authorized numeric,picked numeric,to_pick numeric,uom text,lifecycle_state text,upstream_count bigint,downstream_count bigint)
language sql stable security invoker set search_path=public as $$
with releases as (select id from cargo_releases where organization_id=p_organization_id),
states as (select r.id,nodara_record_quantity_state(p_organization_id,'CARGO_RELEASE',r.id) s from releases r),
up as (select target_id id,count(*) n from operational_links where organization_id=p_organization_id and active=true and target_type='CARGO_RELEASE' group by target_id),
down as (select source_id id,count(*) n from operational_links where organization_id=p_organization_id and active=true and source_type='CARGO_RELEASE' group by source_id)
select st.id,coalesce((s->>'authorized')::numeric,0),coalesce((s->>'picked')::numeric,0),coalesce((s->>'to_pick')::numeric,0),coalesce(nullif(s->>'uom',''),'—'),coalesce(nullif(s->>'state',''),'ALLOCATED'),coalesce(up.n,0),coalesce(down.n,0) from states st left join up on up.id=st.id left join down on down.id=st.id;
$$;
grant execute on function public.nodara_cr_register_states(uuid) to authenticated;
