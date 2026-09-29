-- NODARA tenant boundary hardening: tenant-owned children must agree with their parent organization.
create or replace function public.nodara_assert_same_org(p_child_org uuid,p_parent_table regclass,p_parent_id uuid,p_label text default 'record')
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
 if p_child_org is null then raise exception '% requires organization_id',p_label; end if;
 execute format('select organization_id from %s where id=$1',p_parent_table) into v_org using p_parent_id;
 if v_org is null then raise exception '% parent not found',p_label; end if;
 if v_org<>p_child_org then raise exception 'Cross-organization relationship denied for %',p_label; end if;
end $$;
revoke execute on function public.nodara_assert_same_org(uuid,regclass,uuid,text) from public,anon,authenticated;

create or replace function public.nodara_guard_tenant_children() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 if tg_table_name='shipment_houses' then perform nodara_assert_same_org(new.organization_id,'public.shipments',new.shipment_id,'shipment house');
 elsif tg_table_name='quote_lines' then perform nodara_assert_same_org(new.organization_id,'public.quotes',new.quote_id,'quote line');
 elsif tg_table_name='quote_transaction_links' then perform nodara_assert_same_org(new.organization_id,'public.quotes',new.quote_id,'quote link');perform nodara_assert_same_org(new.organization_id,'public.transactions',new.transaction_id,'quote transaction');
 elsif tg_table_name='customer_invoice_lines' then perform nodara_assert_same_org(new.organization_id,'public.customer_invoices',new.invoice_id,'invoice line');
 elsif tg_table_name='service_requests' then
   if new.customer_id is not null then perform nodara_assert_same_org(new.organization_id,'public.entities',new.customer_id,'service request customer');end if;
 elsif tg_table_name='transport_receiving_links' then perform nodara_assert_same_org(new.organization_id,'public.transport_orders',new.transport_order_id,'transport receiving');perform nodara_assert_same_org(new.organization_id,'public.warehouse_receipts',new.warehouse_receipt_id,'warehouse receiving');
 elsif tg_table_name='ftz_admission_receipts' then perform nodara_assert_same_org(new.organization_id,'public.ftz_admissions',new.admission_id,'FTZ receipt');perform nodara_assert_same_org(new.organization_id,'public.warehouse_receipts',new.warehouse_receipt_id,'FTZ warehouse receipt');
 elsif tg_table_name='ftz_inventory_identity_cargo' then perform nodara_assert_same_org(new.organization_id,'public.ftz_inventory_identities',new.inventory_identity_id,'FTZ identity cargo');perform nodara_assert_same_org(new.organization_id,'public.cargo_objects',new.cargo_object_id,'FTZ cargo');
 elsif tg_table_name='document_activity' then perform nodara_assert_same_org(new.organization_id,'public.documents',new.document_id,'document activity');
 end if;
 return new;
end $$;
revoke execute on function public.nodara_guard_tenant_children() from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['shipment_houses','quote_lines','quote_transaction_links','customer_invoice_lines','service_requests','transport_receiving_links','ftz_admission_receipts','ftz_inventory_identity_cargo','document_activity'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists nodara_tenant_guard on public.%I',t);
   execute format('create trigger nodara_tenant_guard before insert or update on public.%I for each row execute function public.nodara_guard_tenant_children()',t);
  end if;
 end loop;
end $$;

-- Harden the tenant root itself. Members can read their organizations; mutation is intentionally not granted by this policy.
alter table public.organizations enable row level security;
drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations for select to authenticated using(public.nodara_is_org_member(id));

-- Organization master data uses the same tenant predicate.
drop policy if exists organization_facilities_org_access on public.organization_facilities;
create policy organization_facilities_org_access on public.organization_facilities for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists organization_issuing_profiles_org_access on public.organization_issuing_profiles;
create policy organization_issuing_profiles_org_access on public.organization_issuing_profiles for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

-- Tenant integrity diagnostics: exposes schema gaps to members/admin tooling without exposing tenant data.
create or replace view public.nodara_tenant_schema_audit with (security_invoker=true) as
select c.table_name,
       bool_or(c.column_name='organization_id') has_organization_id,
       coalesce((select c2.is_nullable='NO' from information_schema.columns c2 where c2.table_schema='public' and c2.table_name=c.table_name and c2.column_name='organization_id'),false) organization_required,
       coalesce((select pc.relrowsecurity from pg_class pc join pg_namespace pn on pn.oid=pc.relnamespace where pn.nspname='public' and pc.relname=c.table_name),false) rls_enabled
from information_schema.columns c
where c.table_schema='public'
and c.table_name not in ('unit_catalog')
group by c.table_name;
grant select on public.nodara_tenant_schema_audit to authenticated;

-- Explicit org-safe lookup helpers for UI code. Never accept a naked record id without the org predicate.
create or replace function public.nodara_get_default_warehouse(p_organization_id uuid)
returns public.organization_facilities language plpgsql stable security invoker set search_path=public as $$
declare r public.organization_facilities;
begin
 if not public.nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;
 select * into r from organization_facilities where organization_id=p_organization_id and is_active order by is_default_warehouse desc,created_at limit 1;
 return r;
end $$;
create or replace function public.nodara_get_default_issuer(p_organization_id uuid,p_mode text)
returns public.organization_issuing_profiles language plpgsql stable security invoker set search_path=public as $$
declare r public.organization_issuing_profiles;
begin
 if not public.nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied';end if;
 select * into r from organization_issuing_profiles where organization_id=p_organization_id and active and mode in (upper(p_mode),'GENERAL') order by (mode=upper(p_mode)) desc,default_for_mode desc,created_at limit 1;
 return r;
end $$;
revoke execute on function public.nodara_get_default_warehouse(uuid) from public,anon;grant execute on function public.nodara_get_default_warehouse(uuid) to authenticated;
revoke execute on function public.nodara_get_default_issuer(uuid,text) from public,anon;grant execute on function public.nodara_get_default_issuer(uuid,text) to authenticated;
notify pgrst,'reload schema';