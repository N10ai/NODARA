import { supabase } from './supabase-client.js';

const nowDate=()=>new Date().toISOString().slice(0,10);

export const TARGET_TYPES=Object.freeze({
  WAREHOUSE_RECEIPT:'WAREHOUSE_RECEIPT',
  CARGO_RELEASE:'CARGO_RELEASE',
  SHIPMENT:'SHIPMENT',
  TRANSPORT_ORDER:'TRANSPORT_ORDER',
  CONSOLIDATION:'CONSOLIDATION',
  FTZ_TRANSACTION:'FTZ_TRANSACTION'
});

export async function resolveActiveServiceAgreement({organizationId,customerId,serviceId}){
  if(!organizationId||!customerId||!serviceId)return null;
  const today=nowDate();
  const{data,error}=await supabase.from('service_agreements')
    .select('*,service_catalog(id,code,name,domain,operational_defaults),service_agreement_requirements(*),service_agreement_billing_rules(*),service_agreement_communication_rules(*)')
    .eq('organization_id',organizationId)
    .eq('customer_id',customerId)
    .eq('service_id',serviceId)
    .eq('status','ACTIVE')
    .lte('effective_from',today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order('agreement_version',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error)throw error;
  return data||null;
}

export async function loadOperationalContext({organizationId,targetType,targetId}){
  const{data,error}=await supabase.from('operational_contexts')
    .select('*')
    .eq('organization_id',organizationId)
    .eq('target_type',targetType)
    .eq('target_id',targetId)
    .order('updated_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error)throw error;
  return data||null;
}

function getPath(obj,path){return String(path||'').split('.').filter(Boolean).reduce((v,k)=>v?.[k],obj)}
function matchesCondition(actual,expected){
  if(expected&&typeof expected==='object'&&!Array.isArray(expected)){
    if('eq'in expected&&actual!==expected.eq)return false;
    if('neq'in expected&&actual===expected.neq)return false;
    if('in'in expected&&!expected.in?.includes(actual))return false;
    if('present'in expected&&Boolean(actual)!==Boolean(expected.present))return false;
    if('gte'in expected&&!(Number(actual)>=Number(expected.gte)))return false;
    if('lte'in expected&&!(Number(actual)<=Number(expected.lte)))return false;
    return true;
  }
  return actual===expected;
}

export function conditionsMatch(conditions={},facts={}){
  return Object.entries(conditions||{}).every(([path,expected])=>matchesCondition(getPath(facts,path),expected));
}

function requirementInstances(requirement,facts){
  if(!conditionsMatch(requirement.conditions,facts))return[];
  const base={
    source_requirement_id:requirement.id,
    requirement_code:requirement.requirement_code,
    label:requirement.label,
    scope:requirement.scope||'TRANSACTION',
    blocking:requirement.blocking!==false,
    provenance:{source:'SERVICE_AGREEMENT',agreement_id:requirement.agreement_id,requirement_id:requirement.id}
  };
  const mode=requirement.repeat_mode||'ONCE';
  if(mode==='PER_HANDLING_UNIT')return(facts.handling_units||[]).map((x,i)=>({...base,scope:'HANDLING_UNIT',scope_id:x.id||null,requirement_code:`${base.requirement_code}:${x.id||i+1}`,provenance:{...base.provenance,handling_unit_id:x.id||null}}));
  if(mode==='PER_ITEM')return(facts.items||[]).map((x,i)=>({...base,scope:'ITEM',scope_id:x.id||null,requirement_code:`${base.requirement_code}:${x.id||i+1}`,provenance:{...base.provenance,item_id:x.id||null}}));
  if(mode==='PER_SERIAL')return(facts.serials||[]).map((x,i)=>({...base,scope:'SERIAL',scope_id:x.id||null,requirement_code:`${base.requirement_code}:${x.id||i+1}`}));
  return[base];
}

export function compileRequirements({agreement,systemRequirements=[],contextRequirements=[],facts={}}){
  const agreementRequirements=(agreement?.service_agreement_requirements||[]).filter(x=>x.active!==false);
  const combined=[...systemRequirements,...agreementRequirements,...contextRequirements];
  const byCode=new Map();
  for(const req of combined){
    for(const instance of requirementInstances(req,facts))byCode.set(instance.requirement_code,{...instance,configuration:req.configuration||{},sort_order:req.sort_order||100});
  }
  return[...byCode.values()].sort((a,b)=>(a.sort_order||100)-(b.sort_order||100));
}

export function tasksFromRequirements(requirements=[]){
  return requirements.map((r,i)=>({
    task_code:r.requirement_code,
    label:r.label,
    sequence_no:i+1,
    action_type:r.configuration?.action_type||inferActionType(r.requirement_code,r.configuration),
    state:'PENDING',
    blocking:r.blocking!==false,
    input_schema:r.configuration?.input_schema||{},
    completion_rule:r.configuration?.completion_rule||inferCompletionRule(r.requirement_code,r.configuration),
    action_config:r.configuration?.action_config||{},
    provenance:r.provenance||{}
  }));
}

function inferActionType(code='',config={}){
  const c=String(code).toUpperCase();
  if(c.includes('PHOTO')||c.includes('EVIDENCE'))return'CAPTURE_EVIDENCE';
  if(c.includes('DOCUMENT')||c.includes('BOL')||c.includes('PACKING_LIST')||c.includes('INVOICE'))return'UPLOAD_DOCUMENT';
  if(c.includes('DIMENSION')||c.includes('WEIGHT')||c.includes('MEASURE'))return'CAPTURE_MEASUREMENT';
  if(c.includes('LABEL'))return'PRINT_LABEL';
  if(c.includes('PUTAWAY')||c.includes('LOCATION'))return'ASSIGN_LOCATION';
  if(c.includes('NOTIFY')||c.includes('COMMUNICATION'))return'SEND_NOTIFICATION';
  if(c.includes('BOOKING'))return'CREATE_BOOKING';
  if(c.includes('SIGN'))return'COLLECT_SIGNATURE';
  return config.action_type||'VERIFY_DATA';
}

function inferCompletionRule(code='',config={}){
  const action=inferActionType(code,config);
  const defaults={
    CAPTURE_EVIDENCE:{type:'EVIDENCE_EXISTS'},
    UPLOAD_DOCUMENT:{type:'DOCUMENT_EXISTS'},
    CAPTURE_MEASUREMENT:{type:'MEASUREMENT_COMPLETE'},
    PRINT_LABEL:{type:'LABEL_PRINT_RECORDED'},
    ASSIGN_LOCATION:{type:'LOCATION_ASSIGNED'},
    SEND_NOTIFICATION:{type:'COMMUNICATION_RECORDED'},
    CREATE_BOOKING:{type:'BOOKING_CONFIRMED'},
    COLLECT_SIGNATURE:{type:'SIGNATURE_COMPLETED'},
    VERIFY_DATA:{type:'FACT_VERIFIED'}
  };
  return defaults[action]||{type:'MANUAL_VERIFICATION'};
}

export async function createCompiledWorkflow({organizationId,targetType,targetId,agreement,operationalContext,requirements,workflowCode}){
  const{data:run,error}=await supabase.from('workflow_runs_v2').insert({
    organization_id:organizationId,target_type:targetType,target_id:targetId,
    agreement_id:agreement?.id||null,operational_context_id:operationalContext?.id||null,
    workflow_code:workflowCode,compiled_from:{agreement_id:agreement?.id||null,context_id:operationalContext?.id||null,compiled_at:new Date().toISOString()}
  }).select().single();
  if(error)throw error;
  const instanceRows=requirements.map(r=>({organization_id:organizationId,target_type:targetType,target_id:targetId,agreement_id:agreement?.id||null,...r,status:'PENDING'}));
  const{data:instances,error:ie}=instanceRows.length?await supabase.from('transaction_requirement_instances').insert(instanceRows).select():{data:[],error:null};
  if(ie)throw ie;
  const instanceByCode=new Map((instances||[]).map(x=>[x.requirement_code,x.id]));
  const taskRows=tasksFromRequirements(requirements).map(t=>({organization_id:organizationId,workflow_run_id:run.id,requirement_instance_id:instanceByCode.get(t.task_code)||null,...t}));
  if(taskRows.length){const{error:te}=await supabase.from('workflow_tasks_v2').insert(taskRows);if(te)throw te;}
  return{run,requirements:instances||[],tasks:taskRows};
}

export async function loadTransactionWork({organizationId,targetType,targetId}){
  const{data:run,error}=await supabase.from('workflow_runs_v2').select('*').eq('organization_id',organizationId).eq('target_type',targetType).eq('target_id',targetId).order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;if(!run)return null;
  const[tasksRes,reqRes,overrideRes]=await Promise.all([
    supabase.from('workflow_tasks_v2').select('*').eq('workflow_run_id',run.id).order('sequence_no'),
    supabase.from('transaction_requirement_instances').select('*').eq('organization_id',organizationId).eq('target_type',targetType).eq('target_id',targetId).order('created_at'),
    supabase.from('transaction_overrides').select('*').eq('organization_id',organizationId).eq('target_type',targetType).eq('target_id',targetId).order('created_at')
  ]);
  for(const x of[tasksRes,reqRes,overrideRes])if(x.error)throw x.error;
  return{run,tasks:tasksRes.data||[],requirements:reqRes.data||[],overrides:overrideRes.data||[]};
}
