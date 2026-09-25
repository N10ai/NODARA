create or replace function public.nodara_available_cargo_for_release(p_release_id uuid)
returns table(cargo_unit_id uuid,available_quantity numeric,current_release_line_id uuid,current_release_requested numeric,current_release_picked numeric)
language sql stable security invoker as $$
with target as (select id,organization_id,customer_id from public.cargo_releases where id=p_release_id),
commitments as (
 select l.cargo_unit_id,
 sum(greatest(coalesce(l.requested_quantity,0)-coalesce(l.picked_quantity,0),0)) filter (where upper(coalesce(cr.status::text,'')) not in ('RELEASED','CANCELLED','VOID')) outstanding,
 (array_agg(l.id) filter (where l.cargo_release_id=p_release_id))[1] current_line_id,
 max(l.requested_quantity) filter (where l.cargo_release_id=p_release_id) current_requested,
 max(coalesce(l.picked_quantity,0)) filter (where l.cargo_release_id=p_release_id) current_picked
 from public.cargo_release_lines l join public.cargo_releases cr on cr.id=l.cargo_release_id join target t on t.organization_id=l.organization_id group by l.cargo_unit_id
)
select cu.id,greatest(coalesce(cu.quantity,0)-coalesce(c.outstanding,0),0)::numeric,c.current_line_id,c.current_requested,c.current_picked
from public.cargo_units cu join target t on t.organization_id=cu.organization_id left join commitments c on c.cargo_unit_id=cu.id left join public.jobs j on j.id=cu.job_id
where coalesce(cu.quantity,0)>0 and upper(coalesce(cu.status::text,'')) not in ('RELEASED','SHIPPED','DELETED','VOID','CANCELLED','DEPLETED','HOLD') and (t.customer_id is null or j.customer_id=t.customer_id) and greatest(coalesce(cu.quantity,0)-coalesce(c.outstanding,0),0)>0
$$;