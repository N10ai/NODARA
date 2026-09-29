-- Replace permissive legacy location policies and extend cross-tenant guards to core commercial/cargo relationships.
drop policy if exists warehouse_locations_authenticated_select on public.warehouse_locations;
drop policy if exists warehouse_locations_authenticated_insert on public.warehouse_locations;
drop policy if exists warehouse_locations_authenticated_update on public.warehouse_locations;
drop policy if exists warehouse_locations_org_access on public.warehouse_locations;
create policy warehouse_locations_org_access on public.warehouse_locations for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

create or replace function public.nodara_guard_tenant_core() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 if tg_table_name='standard_rates' then perform nodara_assert_same_org(new.organization_id,'public.service_catalog',new.service_id,'standard rate service');
 elsif tg_table_name='customer_rate_agreements' then perform nodara_assert_same_org(new.organization_id,'public.entities',new.customer_id,'rate customer');perform nodara_assert_same_org(new.organization_id,'public.service_catalog',new.service_id,'rate service');
 elsif tg_table_name='customer_billing_profiles' then perform nodara_assert_same_org(new.organization_id,'public.entities',new.customer_id,'billing customer');
 elsif tg_table_name='operational_charges' then
   if new.customer_id is not null then perform nodara_assert_same_org(new.organization_id,'public.entities',new.customer_id,'charge customer');end if;
   if new.vendor_id is not null then perform nodara_assert_same_org(new.organization_id,'public.entities',new.vendor_id,'charge vendor');end if;
   if new.service_id is not null then perform nodara_assert_same_org(new.organization_id,'public.service_catalog',new.service_id,'charge service');end if;
 elsif tg_table_name='cargo_assignments' then perform nodara_assert_same_org(new.organization_id,'public.cargo_objects',new.cargo_object_id,'cargo assignment');
 elsif tg_table_name='cargo_events' then perform nodara_assert_same_org(new.organization_id,'public.cargo_objects',new.cargo_object_id,'cargo event');
 elsif tg_table_name='cargo_objects' then
   if new.owner_entity_id is not null then perform nodara_assert_same_org(new.organization_id,'public.entities',new.owner_entity_id,'cargo owner');end if;
 elsif tg_table_name='warehouse_locations' and new.parent_id is not null then perform nodara_assert_same_org(new.organization_id,'public.warehouse_locations',new.parent_id,'location parent');
 end if;return new;
end $$;
revoke execute on function public.nodara_guard_tenant_core() from public,anon,authenticated;
do $$ declare t text;begin foreach t in array array['standard_rates','customer_rate_agreements','customer_billing_profiles','operational_charges','cargo_assignments','cargo_events','cargo_objects','warehouse_locations'] loop
 if to_regclass('public.'||t) is not null then execute format('drop trigger if exists nodara_tenant_core_guard on public.%I',t);execute format('create trigger nodara_tenant_core_guard before insert or update on public.%I for each row execute function public.nodara_guard_tenant_core()',t);end if;
end loop;end $$;

-- Existing transaction child guards are retained; ensure their policies are explicitly authenticated.
drop policy if exists transactions_org_access on public.transactions;create policy transactions_org_access on public.transactions for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists transaction_parties_org_access on public.transaction_parties;create policy transaction_parties_org_access on public.transaction_parties for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists transaction_references_org_access on public.transaction_references;create policy transaction_references_org_access on public.transaction_references for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists transaction_relationships_org_access on public.transaction_relationships;create policy transaction_relationships_org_access on public.transaction_relationships for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

notify pgrst,'reload schema';