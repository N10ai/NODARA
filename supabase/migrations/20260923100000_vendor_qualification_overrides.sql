create table if not exists public.vendor_qualification_overrides(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,vendor_id uuid not null references public.entities(id) on delete restrict,
 context_type text not null,context_id uuid,reason text not null,qualification_snapshot jsonb not null default '{}'::jsonb,
 approved_by uuid default auth.uid(),approved_at timestamptz not null default now(),expires_at timestamptz,revoked_at timestamptz,metadata jsonb not null default '{}'::jsonb);
create index if not exists vendor_qualification_overrides_context_idx on public.vendor_qualification_overrides(organization_id,context_type,context_id,vendor_id);
alter table public.vendor_qualification_overrides enable row level security;
drop policy if exists vendor_qualification_overrides_org on public.vendor_qualification_overrides;
create policy vendor_qualification_overrides_org on public.vendor_qualification_overrides for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));