-- Enrich the standard Warehouse Receipt blueprint with professional receiving recommendations.
-- Customer Service Agreements may override these codes and make them blocking or change configuration.
with b as (
  select id from public.transaction_blueprints_v2
  where code='WR_STANDARD' and status='ACTIVE'
  order by version desc limit 1
)
insert into public.transaction_blueprint_requirements
  (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,v.code,v.kind,v.label,v.scope,v.blocking,v.repeat_mode,'{}'::jsonb,v.configuration,v.sort_order,true,
       jsonb_build_object('source','NODARA_STANDARD','policy','recommended_unless_agreement_overrides')
from b cross join (values
 ('CAPTURE_MEASUREMENTS','MEASUREMENT','Capture weight and dimensions','HANDLING_UNIT',false,'PER_HANDLING_UNIT',jsonb_build_object('action_type','CAPTURE_MEASUREMENT','completion_rule',jsonb_build_object('type','MEASUREMENT_COMPLETE')),30),
 ('RECEIVING_PHOTOS','EVIDENCE','Capture receiving condition photos','TRANSACTION',false,'ONCE',jsonb_build_object('action_type','CAPTURE_EVIDENCE','action_config',jsonb_build_object('evidence_type','RECEIVING_PHOTO','recommended_minimum',3),'completion_rule',jsonb_build_object('type','EVIDENCE_EXISTS')),40),
 ('RECEIVING_DOCUMENTS','DOCUMENT','Attach receiving documents','TRANSACTION',false,'ONCE',jsonb_build_object('action_type','UPLOAD_DOCUMENT','action_config',jsonb_build_object('suggested_types',jsonb_build_array('BOL','PACKING_LIST','COMMERCIAL_INVOICE')),'completion_rule',jsonb_build_object('type','DOCUMENT_EXISTS')),50),
 ('PRINT_HU_LABELS','LABEL','Generate handling-unit labels','HANDLING_UNIT',false,'PER_HANDLING_UNIT',jsonb_build_object('action_type','PRINT_LABEL','completion_rule',jsonb_build_object('type','LABEL_PRINT_RECORDED')),70),
 ('NOTIFY_RECEIPT_COMPLETE','COMMUNICATION','Notify receipt completion','TRANSACTION',false,'ONCE',jsonb_build_object('action_type','SEND_NOTIFICATION','completion_rule',jsonb_build_object('type','COMMUNICATION_RECORDED')),90)
) as v(code,kind,label,scope,blocking,repeat_mode,configuration,sort_order)
where not exists(
  select 1 from public.transaction_blueprint_requirements r
  where r.blueprint_id=b.id and r.requirement_code=v.code
);
