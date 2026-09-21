-- Canonical document manager extension
alter table public.document_links add column if not exists context_type text;
alter table public.document_links add column if not exists context_id uuid;
alter table public.document_links add column if not exists context_reference text;
alter table public.documents add column if not exists regulatory boolean not null default false;
alter table public.documents add column if not exists ftz_controlled boolean not null default false;
create table if not exists public.document_activity (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 document_id uuid not null references public.documents(id) on delete restrict,
 action text not null, detail jsonb not null default '{}'::jsonb,
 actor_id uuid default auth.uid(), created_at timestamptz not null default now());
create index if not exists document_links_context_idx on public.document_links(organization_id,context_type,context_id);
create index if not exists document_activity_doc_idx on public.document_activity(document_id,created_at desc);
alter table public.document_activity enable row level security;
drop policy if exists document_activity_org on public.document_activity;
create policy document_activity_org on public.document_activity using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));