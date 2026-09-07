-- Make canonical transaction cargo transaction-aware for Cargo Releases.
-- A CR represents allocated/released quantity, not the full source WR quantity.

create or replace function public.nodara_transaction_cargo_items(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public'
as $$
declare tx public.transactions%rowtype; out_json jsonb;
begin
 select * into tx from public.transactions where id=p_transaction_id;
 if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 if tx.transaction_type='CARGO_RELEASE' then
   select coalesce(jsonb_agg(jsonb_build_object(
     'release_line',to_jsonb(l),'cargo_unit',to_jsonb(u),'cargo_object',to_jsonb(c),
     'allocated_quantity',l.requested_quantity,
     'measurement_semantics',jsonb_build_object(
       'source_quantity',u.quantity,'allocated_quantity',l.requested_quantity,
       'dimensions_basis',coalesce(c.dimension_basis,u.dimension_basis,'PER_UNIT'),
       'gross_weight_basis',coalesce(c.gross_weight_basis,u.gross_weight_basis,'LINE_TOTAL'),
       'allocation_fraction',case when coalesce(u.quantity,0)>0 then l.requested_quantity/u.quantity else null end
     )) order by l.created_at),'[]'::jsonb) into out_json
   from public.cargo_release_lines l
   left join public.cargo_units u on u.id=l.cargo_unit_id
   left join public.cargo_objects c on c.id=u.cargo_object_id
   where l.cargo_release_id=tx.domain_record_id and l.organization_id=tx.organization_id;
 else
   select coalesce(jsonb_agg(jsonb_build_object(
     'assignment',to_jsonb(a),'cargo_object',to_jsonb(c),
     'measurement_semantics',jsonb_build_object(
       'quantity',c.quantity,'dimensions_basis',c.dimension_basis,'gross_weight_basis',c.gross_weight_basis,
       'dimensions_meaning',case when c.dimension_basis='PER_UNIT' then 'entered dimensions apply to each unit in quantity' else 'entered dimensions describe the whole line/lot' end,
       'gross_weight_meaning',case when c.gross_weight_basis='PER_UNIT' then 'entered gross weight applies to each unit in quantity' else 'entered gross weight is total for the line/lot' end
     )) order by a.sequence_no,a.created_at),'[]'::jsonb) into out_json
   from public.cargo_assignments a join public.cargo_objects c on c.id=a.cargo_object_id
   where a.organization_id=tx.organization_id and a.transaction_type=tx.transaction_type and a.transaction_id=tx.domain_record_id and a.status<>'REMOVED';
 end if;
 return coalesce(out_json,'[]'::jsonb);
end $$;

create or replace function public.nodara_transaction_cargo_totals(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public'
as $$
declare tx public.transactions%rowtype; result jsonb;
begin
 select * into tx from public.transactions where id=p_transaction_id;
 if tx.id is null then raise exception 'Transaction not found'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if;
 if tx.transaction_type='CARGO_RELEASE' then
   select jsonb_build_object(
     'handling_units',coalesce(sum(l.requested_quantity),0),
     'volume_cbm',coalesce(sum(case when coalesce(u.quantity,0)>0 then coalesce(c.calculated_volume_cbm,c.volume_cbm,0)*(l.requested_quantity/u.quantity) else 0 end),0),
     'gross_weight_kg',coalesce(sum(case when coalesce(u.quantity,0)>0 then coalesce(c.calculated_gross_weight_kg,0)*(l.requested_quantity/u.quantity) else 0 end),0),
     'basis','ALLOCATED_QUANTITY') into result
   from public.cargo_release_lines l
   left join public.cargo_units u on u.id=l.cargo_unit_id
   left join public.cargo_objects c on c.id=u.cargo_object_id
   where l.cargo_release_id=tx.domain_record_id and l.organization_id=tx.organization_id;
 else
   select jsonb_build_object(
     'handling_units',coalesce(sum(c.quantity),0),
     'volume_cbm',coalesce(sum(coalesce(c.calculated_volume_cbm,c.volume_cbm,0)),0),
     'gross_weight_kg',coalesce(sum(coalesce(c.calculated_gross_weight_kg,0)),0),
     'basis','ASSIGNED_CARGO') into result
   from public.cargo_assignments a join public.cargo_objects c on c.id=a.cargo_object_id
   where a.organization_id=tx.organization_id and a.transaction_type=tx.transaction_type and a.transaction_id=tx.domain_record_id and a.status<>'REMOVED';
 end if;
 return coalesce(result,jsonb_build_object('handling_units',0,'volume_cbm',0,'gross_weight_kg',0));
end $$;

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
    'cargo', public.nodara_transaction_cargo_items(tx.id),
    'cargo_totals', public.nodara_transaction_cargo_totals(tx.id),
    'calculations', coalesce((select jsonb_agg(to_jsonb(x) order by x.calculated_at desc) from public.calculation_snapshots x where x.transaction_id=tx.id and x.status='CURRENT'),'[]'::jsonb),
    'documents', jsonb_build_object('count',(select count(*) from public.documents d where d.transaction_id=tx.id and coalesce(d.is_current,true)),'items',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.documents d where d.transaction_id=tx.id and coalesce(d.is_current,true)),'[]'::jsonb)),
    'charges', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.operational_charges x where x.transaction_id=tx.id),'[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(x) order by x.pinned desc,x.created_at desc) from public.transaction_notes x where x.registry_transaction_id=tx.id and x.deleted_at is null),'[]'::jsonb),
    'requirements', coalesce((select jsonb_agg(to_jsonb(x) order by x.blocking desc,x.created_at) from public.transaction_requirement_instances x where x.organization_id=tx.organization_id and ((x.target_type='TRANSACTION' and x.target_id=tx.id) or (x.target_type=tx.transaction_type and x.target_id=tx.domain_record_id))),'[]'::jsonb),
    'extensions', coalesce((select jsonb_agg(jsonb_build_object('definition',to_jsonb(fd),'value',to_jsonb(fv)) order by fd.sort_order,fd.label) from public.extension_field_values fv join public.extension_field_definitions fd on fd.id=fv.field_definition_id where fv.transaction_id=tx.id),'[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.nodara_transaction_cargo_items(uuid) from public,anon,authenticated;
revoke all on function public.nodara_transaction_cargo_totals(uuid) from public,anon,authenticated;
revoke all on function public.nodara_get_transaction_read_model(uuid) from public,anon;
grant execute on function public.nodara_get_transaction_read_model(uuid) to authenticated;
