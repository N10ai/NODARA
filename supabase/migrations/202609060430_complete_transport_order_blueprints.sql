-- Complete canonical transport coverage for PICKUP / DELIVERY / TRANSFER / DRAYAGE.
insert into public.transaction_blueprints_v2
  (organization_id,transaction_type,code,name,version,status,context_conditions,field_schema,lifecycle,description,metadata)
select null,'TRANSPORT_ORDER',v.code,v.name,1,'ACTIVE',v.conditions,v.fields,v.lifecycle,v.description,jsonb_build_object('source','NODARA_STANDARD')
from (values
 ('TRANSPORT_TRANSFER','Transport · Transfer',jsonb_build_object('order_type','TRANSFER'),jsonb_build_object('required_facts',jsonb_build_array('customer','pickup_location','delivery_location_or_destination','pickup_window','cargo'),'optional_facts',jsonb_build_array('carrier','driver','equipment','customer_reference','instructions')),jsonb_build_array('VERIFY_REQUEST','DISPATCH','PICKUP','IN_TRANSIT','DELIVER','POD','COMPLETE'),'Canonical warehouse/airport/facility transfer workflow.'),
 ('TRANSPORT_DRAYAGE','Transport · Drayage',jsonb_build_object('order_type','DRAYAGE'),jsonb_build_object('required_facts',jsonb_build_array('customer','pickup_location','delivery_location','pickup_window','cargo','equipment'),'optional_facts',jsonb_build_array('carrier','driver','customer_reference','instructions')),jsonb_build_array('VERIFY_REQUEST','DISPATCH','PICKUP','IN_TRANSIT','DELIVER','POD','COMPLETE'),'Canonical drayage workflow using explicit equipment and custody milestones.')
) as v(code,name,conditions,fields,lifecycle,description)
where not exists(select 1 from public.transaction_blueprints_v2 b where b.code=v.code and b.status='ACTIVE');

with b as (select id,code from public.transaction_blueprints_v2 where code in ('TRANSPORT_TRANSFER','TRANSPORT_DRAYAGE') and status='ACTIVE')
insert into public.transaction_blueprint_requirements
  (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,x.code,x.kind,x.label,'TRANSACTION',true,'ONCE','{}'::jsonb,x.config,x.sort_order,true,jsonb_build_object('source','NODARA_STANDARD')
from b join lateral (values
 (case when b.code='TRANSPORT_DRAYAGE' then 'VERIFY_DRAYAGE_REQUEST' else 'VERIFY_TRANSFER_REQUEST' end,'DATA',case when b.code='TRANSPORT_DRAYAGE' then 'Verify drayage request, equipment, route, window and cargo' else 'Verify transfer request, route, window and cargo' end,jsonb_build_object('action_type','VERIFY_DATA','completion_rule',jsonb_build_object('type','TRANSPORT_REQUEST_COMPLETE')),10),
 (case when b.code='TRANSPORT_DRAYAGE' then 'DISPATCH_DRAYAGE' else 'DISPATCH_TRANSFER' end,'DISPATCH','Assign/confirm carrier and dispatch',jsonb_build_object('action_type','DISPATCH','completion_rule',jsonb_build_object('type','DISPATCH_CONFIRMED')),30),
 ('CONFIRM_PICKUP','MILESTONE','Confirm physical pickup',jsonb_build_object('action_type','CONFIRM_PICKUP','completion_rule',jsonb_build_object('type','PICKUP_CONFIRMED')),50),
 ('CONFIRM_DELIVERY','MILESTONE','Confirm physical delivery',jsonb_build_object('action_type','CONFIRM_DELIVERY','completion_rule',jsonb_build_object('type','DELIVERY_CONFIRMED')),70),
 ('CAPTURE_TRANSPORT_POD','EVIDENCE','Capture transport POD',jsonb_build_object('action_type','CAPTURE_EVIDENCE','completion_rule',jsonb_build_object('type','POD_EXISTS')),80)
) as x(code,kind,label,config,sort_order) on true
where not exists(select 1 from public.transaction_blueprint_requirements r where r.blueprint_id=b.id and r.requirement_code=x.code);

with b as (select id from public.transaction_blueprints_v2 where code='TRANSPORT_PICKUP' and status='ACTIVE' order by version desc limit 1)
insert into public.transaction_blueprint_requirements
  (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,x.code,x.kind,x.label,'TRANSACTION',true,'ONCE','{}'::jsonb,x.config,x.sort_order,true,jsonb_build_object('source','NODARA_STANDARD')
from b cross join (values
 ('CONFIRM_PICKUP','MILESTONE','Confirm physical pickup',jsonb_build_object('action_type','CONFIRM_PICKUP','completion_rule',jsonb_build_object('type','PICKUP_CONFIRMED')),50),
 ('CONFIRM_DELIVERY','MILESTONE','Confirm physical delivery',jsonb_build_object('action_type','CONFIRM_DELIVERY','completion_rule',jsonb_build_object('type','DELIVERY_CONFIRMED')),70),
 ('CAPTURE_TRANSPORT_POD','EVIDENCE','Capture transport POD',jsonb_build_object('action_type','CAPTURE_EVIDENCE','completion_rule',jsonb_build_object('type','POD_EXISTS')),80)
) as x(code,kind,label,config,sort_order)
where not exists(select 1 from public.transaction_blueprint_requirements r where r.blueprint_id=b.id and r.requirement_code=x.code);

with b as (select id from public.transaction_blueprints_v2 where code='TRANSPORT_DELIVERY' and status='ACTIVE' order by version desc limit 1)
insert into public.transaction_blueprint_requirements
  (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,x.code,x.kind,x.label,'TRANSACTION',true,'ONCE','{}'::jsonb,x.config,x.sort_order,true,jsonb_build_object('source','NODARA_STANDARD')
from b cross join (values
 ('DISPATCH_DELIVERY','DISPATCH','Assign/confirm carrier and dispatch',jsonb_build_object('action_type','DISPATCH','completion_rule',jsonb_build_object('type','DISPATCH_CONFIRMED')),30),
 ('CONFIRM_DELIVERY','MILESTONE','Confirm physical delivery',jsonb_build_object('action_type','CONFIRM_DELIVERY','completion_rule',jsonb_build_object('type','DELIVERY_CONFIRMED')),70)
) as x(code,kind,label,config,sort_order)
where not exists(select 1 from public.transaction_blueprint_requirements r where r.blueprint_id=b.id and r.requirement_code=x.code);