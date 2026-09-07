-- Restrict NODARA's foundational command surface and complete RLS on exposed foundation tables.

alter table public.unit_catalog enable row level security;
drop policy if exists unit_catalog_authenticated_read on public.unit_catalog;
create policy unit_catalog_authenticated_read on public.unit_catalog for select to authenticated using (active=true);

alter table public.warehouse_space_allocations enable row level security;
drop policy if exists warehouse_space_allocations_org_access on public.warehouse_space_allocations;
create policy warehouse_space_allocations_org_access on public.warehouse_space_allocations for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

drop policy if exists evidence_records_org_access on public.evidence_records;
create policy evidence_records_org_access on public.evidence_records for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists evidence_coverage_org_access on public.evidence_coverage;
create policy evidence_coverage_org_access on public.evidence_coverage for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists readiness_requirements_org_access on public.readiness_requirements;
create policy readiness_requirements_org_access on public.readiness_requirements for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

alter view public.warehouse_space_utilization set (security_invoker=true);
alter function public.nodara_line_physical_metrics(numeric,numeric,numeric,numeric,text,numeric,text,text,text) set search_path=public;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname = any(array[
    'nodara_validate_transaction_child','nodara_validate_transaction_relationship','nodara_validate_document_link',
    'nodara_sync_transaction_registry','nodara_sync_domain_parties_references','nodara_sync_cargo_unit_object',
    'nodara_guard_cargo_object','nodara_guard_cargo_assignment','nodara_guard_location_capacity',
    'nodara_guard_shipment_write','nodara_guard_shipment_delete','nodara_guard_transport_order_write',
    'nodara_sync_wr_cargo_assignment','nodara_sync_cr_cargo_assignment','nodara_assert_entity_in_org',
    'nodara_assert_transaction_target','nodara_transaction_org','nodara_write_calculation_snapshot','nodara_record_activity'
  ]) loop
    execute format('revoke execute on function %s from public, anon, authenticated',r.sig);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname = any(array[
    'nodara_add_transaction_party','nodara_remove_transaction_party','nodara_add_transaction_reference',
    'nodara_remove_transaction_reference','nodara_relate_transactions','nodara_recalculate_cargo_object_physical',
    'nodara_calculate_air_chargeable_weight','nodara_register_document','nodara_create_document_version',
    'nodara_create_signature_request','nodara_realize_charge'
  ]) loop
    execute format('revoke execute on function %s from public, anon',r.sig);
    execute format('grant execute on function %s to authenticated',r.sig);
  end loop;
end $$;
