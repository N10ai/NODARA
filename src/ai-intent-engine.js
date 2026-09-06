import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const normalize=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ROLE_ALIASES={customer:['customer'],shipper:['shipper'],consignee:['consignee'],carrier:['carrier','trucker'],driver:['driver']};

function browserContext(extra={}){
  return{
    current_route:window.__nodaraRoute||null,
    current_record:document.querySelector('.record-number,.record-header h1.title')?.textContent?.trim()||null,
    local_time:new Date().toISOString(),
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null,
    ...extra
  };
}

async function createAudit(text,source,context){
  const organization_id=await getCurrentOrganizationId(),{data:{user}}=await supabase.auth.getUser();
  const{data,error}=await supabase.from('ai_intent_runs').insert({organization_id,user_id:user?.id||null,input_source:source,input_text:text,status:'PARSING',metadata:{context}}).select().single();
  if(error)throw error;return data;
}
async function updateAudit(id,patch){if(!id)return;const{error}=await supabase.from('ai_intent_runs').update({...patch,updated_at:new Date().toISOString()}).eq('id',id);if(error)console.warn('AI intent audit update failed',error)}

async function invokeParser(text,source,context){
  const{data,error}=await supabase.functions.invoke('nodara-intent',{body:{text,source,context}});
  if(!error)return data;
  let detail=null;try{if(error.context?.json)detail=await error.context.json()}catch{}
  const e=new Error(detail?.message||detail?.details||error.message||'AI parser unavailable');
  e.code=detail?.error||'AI_FUNCTION_ERROR';e.details=detail;throw e;
}

async function entities(){const{data,error}=await supabase.from('entities').select('id,name,code,roles').order('name').limit(3000);if(error)throw error;return data||[]}
function roleAllowed(e,role){if(!role)return true;const roles=(e.roles||[]).map(normalize),allowed=ROLE_ALIASES[role]||[role];return !roles.length||allowed.some(x=>roles.includes(normalize(x)))}
function scoreEntity(e,input){const q=normalize(input),name=normalize(e.name),code=normalize(e.code);if(!q)return 0;if(code&&q===code)return 120;if(q===name)return 110;if(code&&code.startsWith(q))return 85;if(name.startsWith(q))return 80;if(name.includes(q)||q.includes(name))return 60;return 0}
function resolveEntityName(rows,input,role){
  if(!input)return{input:null,status:'EMPTY',role,candidates:[]};
  let pool=rows.filter(x=>roleAllowed(x,role)).map(x=>({x,score:scoreEntity(x,input)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(!pool.length)pool=rows.map(x=>({x,score:scoreEntity(x,input)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(!pool.length)return{input,status:'NOT_FOUND',role,candidates:[]};const top=pool[0].score,winners=pool.filter(x=>x.score===top);
  if(winners.length!==1)return{input,status:'AMBIGUOUS',role,candidates:winners.slice(0,8).map(({x})=>({id:x.id,name:x.name,code:x.code,roles:x.roles||[]}))};
  const e=winners[0].x;return{input,status:'RESOLVED',role,entity_id:e.id,name:e.name,code:e.code,roles:e.roles||[],candidates:[{id:e.id,name:e.name,code:e.code,roles:e.roles||[]}]};
}
async function resolveService(input){
  if(!input)return{input:null,status:'EMPTY',candidates:[]};const org=await getCurrentOrganizationId(),{data,error}=await supabase.from('service_catalog').select('id,code,name,domain,active').eq('organization_id',org).eq('active',true).order('name');if(error)throw error;const q=normalize(input),scored=(data||[]).map(x=>({x,score:q===normalize(x.code)?120:q===normalize(x.name)?110:normalize(x.name).includes(q)||q.includes(normalize(x.name))?60:0})).filter(x=>x.score).sort((a,b)=>b.score-a.score);if(!scored.length)return{input,status:'NOT_FOUND',candidates:[]};const top=scored[0].score,w=scored.filter(x=>x.score===top);if(w.length!==1)return{input,status:'AMBIGUOUS',candidates:w.map(y=>y.x)};return{input,status:'RESOLVED',service_id:w[0].x.id,...w[0].x,candidates:[w[0].x]};
}
export async function resolveIntent(intent){
  const rows=await entities(),f=intent?.facts||{},resolution={entities:{}};
  for(const [key,role] of [['customer_name','customer'],['shipper_name','shipper'],['consignee_name','consignee'],['carrier_name','carrier'],['driver_name','driver']])resolution.entities[key]=resolveEntityName(rows,f[key],role);
  resolution.service=await resolveService(f.service_name||f.service_type);
  resolution.has_ambiguity=Object.values(resolution.entities).some(x=>x.status==='AMBIGUOUS')||resolution.service.status==='AMBIGUOUS';
  resolution.has_unresolved=Object.values(resolution.entities).some(x=>x.input&&x.status==='NOT_FOUND')||Boolean(resolution.service.input&&resolution.service.status==='NOT_FOUND');
  return resolution;
}

export async function parseIntent(text,{source='TEXT',context={}}={}){
  text=String(text||'').trim();if(!text)throw new Error('Enter or dictate an instruction first.');source=String(source||'TEXT').toUpperCase();const ctx=browserContext(context),audit=await createAudit(text,source,ctx);
  try{
    const parsed=await invokeParser(text,source,ctx),intent=parsed?.intent;if(!intent)throw new Error('AI parser returned no intent.');const resolution=await resolveIntent(intent);
    const needsConfirmation=Boolean(intent.requires_confirmation||resolution.has_ambiguity||resolution.has_unresolved||Number(intent.confidence||0)<0.82);
    intent.requires_confirmation=needsConfirmation;
    await updateAudit(audit.id,{model:parsed.model||null,intent_type:intent.intent_type,transaction_type:intent.transaction_type,confidence:Number(intent.confidence||0),parsed_intent:intent,resolution,status:'PROPOSED',metadata:{...audit.metadata,response_id:parsed.response_id||null,usage:parsed.usage||null}});
    return{run_id:audit.id,intent,resolution,model:parsed.model||null,response_id:parsed.response_id||null};
  }catch(error){await updateAudit(audit.id,{status:'FAILED',error_message:error.message||String(error)});error.run_id=audit.id;throw error}
}
export async function markIntent(runId,status,{targetType=null,targetId=null,resolution=null,errorMessage=null}={}){const patch={status};if(status==='CONFIRMED')patch.confirmed_at=new Date().toISOString();if(status==='EXECUTED')patch.executed_at=new Date().toISOString();if(targetType)patch.target_type=targetType;if(targetId)patch.target_id=targetId;if(resolution)patch.resolution=resolution;if(errorMessage)patch.error_message=errorMessage;await updateAudit(runId,patch)}

window.nodaraAIIntentEngine={parse:parseIntent,resolve:resolveIntent,mark:markIntent};
