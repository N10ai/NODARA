-- NODARA commercial engine RLS
-- Uses organization membership to scope commercial records.
-- Run in Supabase SQL Editor after the commercial engine migration.

do $$
begin
  if to_regclass('public.organization_members') is null then
    raise exception 'public.organization_members not found; use the membership table used by this NODARA project before applying these policies.';
  end if;
end $$;

create or replace function public.nodara_is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
  );
$$;

grant execute on function public.nodara_is_org_member(uuid) to authenticated;

-- Apply one consistent organization-scoped policy to every commercial table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'service_catalog',
    'standard_rates',
    'customer_billing_profiles',
    'customer_rate_agreements',
    'rate_templates',
    'rate_template_lines',
    'customer_service_templates',
    'operational_conversations',
    'operational_charges'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_org_access', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id))',
        t || '_org_access', t
      );
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
