-- Canonical transaction read model + explicit cargo measurement semantics.
-- IMPORTANT: quantity and measurement basis are independent.
-- Example: qty=10, gross_weight=680 LB, gross_weight_basis=PER_UNIT => 6,800 LB line total.
--          qty=10, gross_weight=680 LB, gross_weight_basis=LINE_TOTAL => 680 LB line total.
-- Dimensions follow the same basis concept independently.

create or replace function public.nodara_get_transaction_read_model(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare tx public.transactions%rowtype; result jsonb;
begin
  select * into tx from public.transactions where id=p_transaction_id;
  if tx.id is null then raise exception 'Transaction not found'; end if;
  if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;

  select jsonb_build_object(
    'transaction', to_jsonb(tx),
    'parties', coalesce((select jsonb_agg(to_jsonb(x) order by x.role_code,x.sequence_no,x.created_at) from public.transaction_parties x where x.transaction_id=tx.id),'[]'::jsonb),
    'references', coalesce((select jsonb_agg(to_jsonb(x) order by x.is_primary desc,x.created_at) from public.transaction_references x where x.transaction_id=tx.id),'[]'::jsonb),
    'relationships', coalesce((select jsonb_agg(jsonb_build_object('direction',case when x.from_transaction_id=tx.id then 'OUTBOUND' else 'INBOUND' end,'relationship',to_jsonb(x),'related_transaction',to_jsonb(rt)) order by x.created_at) from public.transaction_relationships x join public.transactions rt on rt.id=case when x.from_transaction_id=tx.id then x.to_transaction_id else x.from_transaction_id end where x.from_transaction_id=tx.id or x.to_transaction_id=tx.id),'[]'::jsonb),
    'milestones', coalesce((select jsonb_agg(to_jsonb(x) order by x.sequence_no,x.milestone_at nulls last,x.milestone_date nulls last) from public.transaction_milestones x where x.transaction_id=tx.id and x.is_current),'[]'::jsonb),
    'cargo', coalesce((select jsonb_agg(jsonb_build_object('assignment',to_jsonb(a),'cargo_object',to_jsonb(c),'measurement_semantics',jsonb_build_object('quantity',c.quantity,'dimensions_basis',c.dimension_basis,'gross_weight_basis',c.gross_weight_basis,'dimensions_meaning',case when c.dimension_basis='PER_UNIT' then 'entered dimensions apply to each unit in quantity' else 'entered dimensions describe the whole line/lot' end,'gross_weight_meaning',case when c.gross_weight_basis='PER_UNIT' then 'entered gross weight applies to each unit in quantity' else 'entered gross weight is total for the line/lot' end)) order by a.sequence_no,a.created_at) from public.cargo_assignments a join public.cargo_objects c on c.id=a.cargo_object_id where a.organization_id=tx.organization_id and a.transaction_type=tx.transaction_type and a.transaction_id=tx.domain_record_id and a.status<>'REMOVED'),'[]'::jsonb),
    'cargo_totals', coalesce((select jsonb_build_object('handling_units',coalesce(sum(c.quantity),0),'volume_cbm',coalesce(sum(coalesce(c.calculated_volume_cbm,c.volume_cbm,0)),0),'gross_weight_kg',coalesce(sum(coalesce(c.calculated_gross_weight_kg,0)),0)) from public.cargo_assignments a join public.cargo_objects c on c.id=a.cargo_object_id where a.organization_id=tx.organization_id and a.transaction_type=tx.transaction_type and a.transaction_id=tx.domain_record_id and a.status<>'REMOVED'),jsonb_build_object('handling_units',0,'volume_cbm',0,'gross_weight_kg',0)),
    'calculations', coalesce((select jsonb_agg(to_jsonb(x) order by x.calculated_at desc) from public.calculation_snapshots x where x.transaction_id=tx.id and x.status='CURRENT'),'[]'::jsonb),
    'documents', jsonb_build_object('count',(select count(*) from public.documents d where d.transaction_id=tx.id and coalesce(d.is_current,true)),'items',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.documents d where d.transaction_id=tx.id and coalesce(d.is_current,true)),'[]'::jsonb)),
    'charges', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.operational_charges x where x.transaction_id=tx.id),'[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(x) order by x.pinned desc,x.created_at desc) from public.transaction_notes x where x.registry_transaction_id=tx.id and x.deleted_at is null),'[]'::jsonb),
    'requirements', coalesce((select jsonb_agg(to_jsonb(x) order by x.blocking desc,x.created_at) from public.transaction_requirement_instances x where x.organization_id=tx.organization_id and ((x.target_type='TRANSACTION' and x.target_id=tx.id) or (x.target_type=tx.transaction_type and x.target_id=tx.domain_record_id))),'[]'::jsonb),
    'extensions', coalesce((select jsonb_agg(jsonb_build_object('definition',to_jsonb(fd),'value',to_jsonb(fv)) order by fd.sort_order,fd.label) from public.extension_field_values fv join public.extension_field_definitions fd on fd.id=fv.field_definition_id where fv.transaction_id=tx.id),'[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.nodara_get_transaction_read_model(uuid) from public, anon;
grant execute on function public.nodara_get_transaction_read_model(uuid) to authenticated;

comment on column public.cargo_objects.dimension_basis is 'Measurement basis. PER_UNIT means entered L/W/H apply to each unit in quantity; LINE_TOTAL means entered dimensions describe the complete line/lot.';
comment on column public.cargo_objects.gross_weight_basis is 'Measurement basis. PER_UNIT means entered gross_weight applies to each unit and is multiplied by quantity; LINE_TOTAL means gross_weight is already the total for the complete line/lot.';
comment on function public.nodara_get_transaction_read_model(uuid) is 'Canonical transaction projection for UI/AI consumption, including explicit cargo measurement semantics.';
