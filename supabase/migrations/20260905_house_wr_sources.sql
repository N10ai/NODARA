create table if not exists public.consolidation_house_sources (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 consolidation_house_id uuid not null references public.consolidation_houses(id) on delete cascade,
 warehouse_receipt_id uuid not null references public.warehouse_receipts(id) on delete cascade,
 notes text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 unique(consolidation_house_id,warehouse_receipt_id)
);
create index if not exists consolidation_house_sources_parent_idx on public.consolidation_house_sources(organization_id,consolidation_house_id);
create index if not exists consolidation_house_sources_wr_idx on public.consolidation_house_sources(organization_id,warehouse_receipt_id);
alter table public.consolidation_house_sources enable row level security;
drop policy if exists consolidation_house_sources_org_access on public.consolidation_house_sources;
do $$ begin if to_regprocedure('public.nodara_is_org_member(uuid)') is not null then create policy consolidation_house_sources_org_access on public.consolidation_house_sources for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id)); end if; end $$;
grant select,insert,update,delete on public.consolidation_house_sources to authenticated;
notify pgrst,'reload schema';