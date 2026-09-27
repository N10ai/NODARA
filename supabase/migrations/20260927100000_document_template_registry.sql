create table if not exists public.document_templates (
  id text primary key,
  organization_id uuid null,
  name text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 1,
  category text not null default 'General',
  placements jsonb not null default '[]'::jsonb,
  design jsonb,
  versions jsonb not null default '[]'::jsonb,
  builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.document_templates enable row level security;
create policy "document_templates_authenticated_read" on public.document_templates for select to authenticated using (true);
create policy "document_templates_authenticated_insert" on public.document_templates for insert to authenticated with check (true);
create policy "document_templates_authenticated_update" on public.document_templates for update to authenticated using (true) with check (true);
create policy "document_templates_authenticated_delete" on public.document_templates for delete to authenticated using (true);
grant select,insert,update,delete on public.document_templates to authenticated;