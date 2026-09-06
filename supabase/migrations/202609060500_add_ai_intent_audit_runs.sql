create table if not exists public.ai_intent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  input_source text not null default 'TEXT' check(input_source in ('TEXT','VOICE','EMAIL','DOCUMENT','OTHER')),
  input_text text not null,
  model text,
  intent_type text,
  transaction_type text,
  confidence numeric(5,4),
  parsed_intent jsonb,
  resolution jsonb not null default '{}'::jsonb,
  status text not null default 'PARSING' check(status in ('PARSING','PROPOSED','CONFIRMED','EXECUTED','REJECTED','FAILED')),
  target_type text,
  target_id uuid,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_intent_runs_org_created_idx on public.ai_intent_runs(organization_id,created_at desc);
create index if not exists ai_intent_runs_target_idx on public.ai_intent_runs(target_type,target_id) where target_id is not null;
alter table public.ai_intent_runs enable row level security;
drop policy if exists ai_intent_runs_org_access on public.ai_intent_runs;
create policy ai_intent_runs_org_access on public.ai_intent_runs for all using (nodara_is_org_member(organization_id)) with check (nodara_is_org_member(organization_id));