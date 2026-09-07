create unique index if not exists ux_workflow_runs_v2_one_active_target
on public.workflow_runs_v2(organization_id,target_type,target_id)
where status='ACTIVE';
