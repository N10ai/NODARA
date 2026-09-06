-- Requirement instances belong to a specific compiled workflow run.
-- This preserves history when a service agreement or operational context changes
-- and the transaction is recompiled.
alter table public.transaction_requirement_instances
  add column if not exists workflow_run_id uuid
  references public.workflow_runs_v2(id) on delete set null;

create index if not exists idx_transaction_requirement_instances_workflow_run
  on public.transaction_requirement_instances(workflow_run_id);
