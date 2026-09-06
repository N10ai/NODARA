import { supabase } from './supabase-client.js';
import { conditionsMatch } from './domain-contract-engine.js';

export async function resolveTransactionBlueprint({organizationId,transactionType,facts={}}){
  const{data,error}=await supabase.from('transaction_blueprints_v2')
    .select('*,transaction_blueprint_requirements(*)')
    .eq('transaction_type',transactionType)
    .eq('status','ACTIVE')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order('organization_id',{ascending:false,nullsFirst:false})
    .order('version',{ascending:false});
  if(error)throw error;
  const candidates=(data||[]).filter(x=>conditionsMatch(x.context_conditions||{},facts));
  if(!candidates.length)return null;
  candidates.sort((a,b)=>specificity(b)-specificity(a)||Number(b.version||0)-Number(a.version||0));
  return candidates[0];
}

function specificity(blueprint){
  const conditions=blueprint.context_conditions||{};
  const ownOrg=blueprint.organization_id?1000:0;
  return ownOrg+Object.keys(conditions).length*10;
}

export function blueprintRequirements(blueprint){
  return(blueprint?.transaction_blueprint_requirements||[])
    .filter(x=>x.active!==false)
    .map(x=>({...x,provenance:{source:'TRANSACTION_BLUEPRINT',blueprint_id:blueprint.id,blueprint_code:blueprint.code,blueprint_version:blueprint.version,requirement_id:x.id}}))
    .sort((a,b)=>Number(a.sort_order||100)-Number(b.sort_order||100));
}

export function missingRequiredFacts(blueprint,facts={}){
  const required=blueprint?.field_schema?.required_facts||[];
  return required.filter(path=>!hasFact(facts,path));
}

function hasFact(facts,path){
  if(path==='at_least_one_reference_or_no_reference_reason')return Boolean((facts.references||[]).length||facts.no_reference_reason);
  if(path==='cargo')return Boolean((facts.cargo||facts.handling_units||facts.planned_cargo||[]).length);
  const value=String(path).split('.').reduce((v,k)=>v?.[k],facts);
  return value!==undefined&&value!==null&&value!==''&&!(Array.isArray(value)&&!value.length);
}

export function blueprintPromptPlan(blueprint,facts={}){
  const missing=missingRequiredFacts(blueprint,facts);
  return{
    blueprint:{code:blueprint?.code,name:blueprint?.name,transaction_type:blueprint?.transaction_type,version:blueprint?.version},
    missing_required_facts:missing,
    lifecycle:blueprint?.lifecycle||[],
    ask_next:missing[0]||null
  };
}
