create table if not exists public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null,
  name text,
  type text not null default 'BIN',
  zone text,
  parent_id uuid references public.warehouse_locations(id) on delete set null,
  facility text,
  active boolean not null default true,
  capacity numeric,
  capacity_uom text,
  ftz boolean not null default false,
  bonded boolean not null default false,
  restricted boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists warehouse_locations_org_active_idx on public.warehouse_locations(organization_id, active);
create index if not exists warehouse_locations_parent_idx on public.warehouse_locations(parent_id);
create index if not exists warehouse_locations_code_idx on public.warehouse_locations(code);
alter table public.warehouse_locations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='warehouse_locations' and policyname='warehouse_locations_authenticated_select') then
    create policy warehouse_locations_authenticated_select on public.warehouse_locations for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='warehouse_locations' and policyname='warehouse_locations_authenticated_insert') then
    create policy warehouse_locations_authenticated_insert on public.warehouse_locations for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='warehouse_locations' and policyname='warehouse_locations_authenticated_update') then
    create policy warehouse_locations_authenticated_update on public.warehouse_locations for update to authenticated using (true) with check (true);
  end if;
end $$;
