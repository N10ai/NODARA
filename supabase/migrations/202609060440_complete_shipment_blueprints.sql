-- Add a canonical Ground shipment blueprint and shared shipment execution milestones.
insert into public.transaction_blueprints_v2
  (organization_id,transaction_type,code,name,version,status,context_conditions,field_schema,lifecycle,description,metadata)
select null,'SHIPMENT','GROUND_SHIPMENT','Shipment · Ground',1,'ACTIVE',jsonb_build_object('mode','GROUND'),
 jsonb_build_object('required_facts',jsonb_build_array('customer','shipper','consignee','origin','destination','cargo','service_type'),'optional_facts',jsonb_build_array('carrier','booking_reference','equipment','pickup_appointment','delivery_appointment','reference')),
 jsonb_build_array('QUALIFY','PLAN','BOOK_OR_DISPATCH','PICKUP','IN_TRANSIT','DELIVER','POD','BILL','COMPLETE'),
 'Canonical ground forwarding/linehaul shipment workflow.',jsonb_build_object('source','NODARA_STANDARD')
where not exists(select 1 from public.transaction_blueprints_v2 where code='GROUND_SHIPMENT' and status='ACTIVE');

insert into public.transaction_blueprint_requirements
 (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,'VERIFY_SHIPMENT_CORE','DATA','Verify minimum shipment facts','TRANSACTION',true,'ONCE','{}'::jsonb,
 jsonb_build_object('action_type','VERIFY_DATA','completion_rule',jsonb_build_object('type','SHIPMENT_CORE_COMPLETE')),10,true,jsonb_build_object('source','NODARA_STANDARD')
from public.transaction_blueprints_v2 b
where b.transaction_type='SHIPMENT' and b.status='ACTIVE'
  and not exists(select 1 from public.transaction_blueprint_requirements r where r.blueprint_id=b.id and r.requirement_code='VERIFY_SHIPMENT_CORE');

with b as (select id from public.transaction_blueprints_v2 where code='GROUND_SHIPMENT' and status='ACTIVE' order by version desc limit 1)
insert into public.transaction_blueprint_requirements
 (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,x.code,x.kind,x.label,'TRANSACTION',x.blocking,'ONCE','{}'::jsonb,x.config,x.sort_order,true,jsonb_build_object('source','NODARA_STANDARD')
from b cross join (values
 ('BOOK_GROUND','BOOKING','Confirm carrier / linehaul booking',true,jsonb_build_object('action_type','CREATE_BOOKING','completion_rule',jsonb_build_object('type','BOOKING_CONFIRMED')),30),
 ('CONFIRM_DEPARTURE','MILESTONE','Confirm shipment departure',true,jsonb_build_object('action_type','CONFIRM_DEPARTURE','completion_rule',jsonb_build_object('type','DEPARTURE_CONFIRMED')),80),
 ('CONFIRM_ARRIVAL','MILESTONE','Confirm shipment arrival',true,jsonb_build_object('action_type','CONFIRM_ARRIVAL','completion_rule',jsonb_build_object('type','ARRIVAL_CONFIRMED')),90),
 ('CAPTURE_SHIPMENT_POD','EVIDENCE','Capture proof of delivery',true,jsonb_build_object('action_type','CAPTURE_EVIDENCE','completion_rule',jsonb_build_object('type','POD_EXISTS')),100)
) as x(code,kind,label,blocking,config,sort_order)
where not exists(select 1 from public.transaction_blueprint_requirements r where r.blueprint_id=b.id and r.requirement_code=x.code);

with b as (select id from public.transaction_blueprints_v2 where code in ('AIR_EXPORT','OCEAN_EXPORT') and status='ACTIVE')
insert into public.transaction_blueprint_requirements
 (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,x.code,'MILESTONE',x.label,'TRANSACTION',true,'ONCE','{}'::jsonb,x.config,x.sort_order,true,jsonb_build_object('source','NODARA_STANDARD')
from b cross join (values
 ('CONFIRM_DEPARTURE','Confirm carrier departure',jsonb_build_object('action_type','CONFIRM_DEPARTURE','completion_rule',jsonb_build_object('type','DEPARTURE_CONFIRMED')),90),
 ('CONFIRM_ARRIVAL','Confirm destination arrival',jsonb_build_object('action_type','CONFIRM_ARRIVAL','completion_rule',jsonb_build_object('type','ARRIVAL_CONFIRMED')),100)
) as x(code,label,config,sort_order)
where not exists(select 1 from public.transaction_blueprint_requirements r where r.blueprint_id=b.id and r.requirement_code=x.code);

with b as (select id from public.transaction_blueprints_v2 where code in ('AIR_IMPORT','OCEAN_IMPORT') and status='ACTIVE')
insert into public.transaction_blueprint_requirements
 (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,'CONFIRM_ARRIVAL','MILESTONE','Confirm carrier arrival','TRANSACTION',true,'ONCE','{}'::jsonb,
 jsonb_build_object('action_type','CONFIRM_ARRIVAL','completion_rule',jsonb_build_object('type','ARRIVAL_CONFIRMED')),40,true,jsonb_build_object('source','NODARA_STANDARD')
from b where not exists(select 1 from public.transaction_blueprint_requirements r where r.blueprint_id=b.id and r.requirement_code='CONFIRM_ARRIVAL');

with b as (select id from public.transaction_blueprints_v2 where code='OCEAN_EXPORT' and status='ACTIVE' order by version desc limit 1)
insert into public.transaction_blueprint_requirements
 (blueprint_id,requirement_code,requirement_type,label,scope,blocking,repeat_mode,conditions,configuration,sort_order,active,metadata)
select b.id,'VERIFY_OCEAN_CARGO','CARGO','Verify assigned ocean cargo','TRANSACTION',true,'ONCE','{}'::jsonb,
 jsonb_build_object('action_type','VERIFY_CARGO','completion_rule',jsonb_build_object('type','CARGO_ASSIGNED')),50,true,jsonb_build_object('source','NODARA_STANDARD')
from b where not exists(select 1 from public.transaction_blueprint_requirements r where r.blueprint_id=b.id and r.requirement_code='VERIFY_OCEAN_CARGO');