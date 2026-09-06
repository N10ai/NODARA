-- Do not expose a checklist-only staging task. Re-enable when NODARA has a real
-- partial-release staging/location executor and auditable completion evidence.
update public.transaction_blueprint_requirements r
set active=false,
    metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object('disabled_reason','No canonical partial-release staging executor yet')
from public.transaction_blueprints_v2 b
where r.blueprint_id=b.id
  and b.code='CR_STANDARD'
  and r.requirement_code='STAGE_RELEASE';
