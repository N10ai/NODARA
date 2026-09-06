-- Enrich standard Cargo Release knowledge with professional outbound recommendations.
-- Release authority, allocation, picking and custody release remain blocking baseline controls.
-- Service Agreements may promote recommended evidence/staging/notification requirements to blocking.
with b as (
  select id from public.transaction_blueprints_v2
  where code='CR_STANDARD' and status='ACTIVE'
  order by version desc limit 1
)
insert into public.transaction_blueprint_requirements
  (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,v.code,v.kind,v.label,v.scope,v.blocking,v.repeat_mode,'{}'::jsonb,v.configuration,v.sort_order,true,
       jsonb_build_object('source','NODARA_STANDARD','policy','recommended_unless_agreement_overrides')
from b cross join (values
 ('STAGE_RELEASE','INVENTORY','Stage picked cargo for release','TRANSACTION',false,'ONCE',jsonb_build_object('action_type','STAGE_CARGO','completion_rule',jsonb_build_object('type','STAGING_COMPLETE')),40),
 ('CAPTURE_RELEASE_EVIDENCE','EVIDENCE','Capture release evidence','TRANSACTION',false,'ONCE',jsonb_build_object('action_type','CAPTURE_EVIDENCE','action_config',jsonb_build_object('evidence_types',jsonb_build_array('LOAD_PHOTO','DRIVER_ID')),'completion_rule',jsonb_build_object('type','EVIDENCE_EXISTS')),50),
 ('POD_SIGNATURE','CUSTODY','Capture receiver signature / POD','TRANSACTION',false,'ONCE',jsonb_build_object('action_type','COLLECT_SIGNATURE','completion_rule',jsonb_build_object('type','SIGNATURE_COMPLETED')),70),
 ('NOTIFY_RELEASE_COMPLETE','COMMUNICATION','Notify cargo release completion','TRANSACTION',false,'ONCE',jsonb_build_object('action_type','SEND_NOTIFICATION','completion_rule',jsonb_build_object('type','COMMUNICATION_RECORDED')),80)
) as v(code,kind,label,scope,blocking,repeat_mode,configuration,sort_order)
where not exists(
  select 1 from public.transaction_blueprint_requirements r
  where r.blueprint_id=b.id and r.requirement_code=v.code
);
