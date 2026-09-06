import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';
import { resolveTransactionBlueprint, blueprintRequirements, missingRequiredFacts } from './transaction-blueprint-engine.js';
import { compileRequirements, tasksFromRequirements, createCompiledWorkflow, loadOperationalContext } from './domain-contract-engine.js';

const TARGET='WAREHOUSE_RECEIPT';
const TODAY=()=>new Date().toISOString().slice(0,10);
const text=v=>String(v??'').trim();
const main=()=>document.getElementById('main');
let draftAgreementId=null,draftAgreementCustomerId=null;

function draftCustomerId(){return main()?.querySelector('[data-party="customer"]')?.value||null}
function draftReferences(){return [...(main()?.querySelectorAll('[data-ref-value]')||[])].map((el,i)=>({type:main()?.querySelector(`[data-ref-type="${i}"]`)?.value||'REFERENCE',value:text(el.value)})).filter(x=>x.value)}
function selectedExceptions(){return [...(main()?.querySelectorAll('[data-flag].selected')||[])].map(x=>x.dataset.flag).filter(x=>!['DG','BONDED','FTZ'].includes(x))}
function draftHandlingUnits(){const qty=Math.max(0,Number(main()?.querySelector('#outer-qty')?.value||0));const type=main()?.querySelector('#outer-type')?.value||null;return Array.from({length:Number.isFinite(qty)?Math.floor(qty):0},(_,i)=>({id:`draft-hu-${i+1}`,package_type:type,quantity:1}))}
function draftItems(){return [...(main()?.querySelectorAll('[data-item-qty]')||[])].map((el,i)=>({id:`draft-item-${i+1}`,quantity:Number(el.value||0)}))}
function draftContext(){
 const root=main();
 const node=root?.querySelector('[data-context-regime].selected,[data-regime].selected,#wr-context-regime');
 const regime=text(node?.value||node?.dataset?.contextRegime||node?.dataset?.regime).toUpperCase();
 const dg=Boolean(root?.querySelector('[data-context-dg].selected,[data-dg="true"].selected'));
 return{direction:'INBOUND',mode:'WAREHOUSE',ftz:regime==='FTZ',bonded:regime==='BONDED',dangerous_goods:dg,transaction_stage:'RECEIVING'};
}
export function collectWRDraftFacts(){
 const handling_units=draftHandlingUnits(),references=draftReferences(),customerId=draftCustomerId();
 if(customerId!==draftAgreementCustomerId){draftAgreementCustomerId=customerId;draftAgreementId=null}
 return{customer:customerId?{id:customerId}:null,customer_id:customerId,references,no_reference_reason:null,cargo:handling_units,handling_units,items:draftItems(),documents:[...(main()?.querySelectorAll('.draft-file')||[])].map(x=>text(x.textContent)),exceptions:selectedExceptions(),description:text(main()?.querySelector('#wr-description')?.value),context:draftContext()};
}

async function warehouseAgreements(organizationId,customerId){
 if(!organizationId||!customerId)return[];
 const today=TODAY();
 const{data,error}=await supabase.from('service_agreements')
  .select('*,service_catalog(id,code,name,domain,operational_defaults),service_agreement_requirements(*),service_agreement_billing_rules(*),service_agreement_communication_rules(*)')
  .eq('organization_id',organizationId).eq('customer_id',customerId).eq('status','ACTIVE')
  .lte('effective_from',today).or(`effective_to.is.null,effective_to.gte.${today}`)
  .order('agreement_version',{ascending:false});
 if(error)throw error;
 return(data||[]).filter(x=>x.service_catalog?.domain==='WAREHOUSE');
}
function isClearReceivingAgreement(a){const code=String(a?.service_catalog?.code||'').toUpperCase(),name=String(a?.service_catalog?.name||'').toUpperCase();return /(^|_)WR(_|$)|RECEIV/.test(code)||/WAREHOUSE RECEIV|RECEIVING PROCESS|RECEIPT PROCESS/.test(name)}
function chooseAgreement(choices,preferredId=null){if(preferredId){const hit=choices.find(x=>x.id===preferredId);if(hit)return hit}const receiving=choices.filter(isClearReceivingAgreement);if(receiving.length===1)return receiving[0];if(choices.length===1)return choices[0];return null}
export function selectWRDraftAgreement(id){draftAgreementId=id||null;window.dispatchEvent(new CustomEvent('nodara:wr-agreement-changed',{detail:{agreement_id:draftAgreementId}}))}

export async function buildWRDraftPlan(){
 const organizationId=await getCurrentOrganizationId(),facts=collectWRDraftFacts(),agreementChoices=await warehouseAgreements(organizationId,facts.customer_id),agreement=chooseAgreement(agreementChoices,draftAgreementId);
 if(agreement&&!draftAgreementId)draftAgreementId=agreement.id;
 const mergedFacts={...facts,...facts.context,service:agreement?.service_catalog||null,service_agreement:agreement?{id:agreement.id}:null};
 const blueprint=await resolveTransactionBlueprint({organizationId,transactionType:TARGET,facts:mergedFacts});
 const systemRequirements=blueprintRequirements(blueprint),requirements=compileRequirements({agreement,systemRequirements,facts:mergedFacts}),tasks=tasksFromRequirements(requirements);
 const missing=blueprint?missingRequiredFacts(blueprint,mergedFacts):[];
 if(agreementChoices.length>1&&!agreement)missing.unshift('service_agreement');
 return{organizationId,facts:mergedFacts,agreement,agreementChoices,agreementSelectionRequired:agreementChoices.length>1&&!agreement,blueprint,requirements,tasks,missing};
}

export function describeProvenance(item,plan){const p=item?.provenance||{};if(p.source==='SERVICE_AGREEMENT')return plan?.agreement?`${plan.agreement.name} · v${plan.agreement.agreement_version}`:'Customer Service Agreement';if(p.source==='TRANSACTION_BLUEPRINT')return plan?.blueprint?`${plan.blueprint.name} · NODARA standard`:'NODARA transaction standard';if(p.source==='OPERATIONAL_RULE')return p.explanation||'Operational context rule';return p.source||'NODARA rule engine'}

async function loadSavedWRFacts(wrId){
 const{data:wr,error:we}=await supabase.from('warehouse_receipts').select('id,organization_id,job_id,status,notes,jobs(id,customer_id,description,reference)').eq('id',wrId).single();if(we)throw we;
 const[{data:parties,error:pe},{data:cargo,error:ce},{data:refs,error:re}]=await Promise.all([supabase.from('warehouse_receipt_parties').select('*').eq('warehouse_receipt_id',wrId),supabase.from('cargo_units').select('*').eq('job_id',wr.job_id),supabase.from('shipment_references').select('*').eq('warehouse_receipt_id',wrId)]);if(pe)throw pe;if(ce)throw ce;if(re)throw re;
 const customer=(parties||[]).find(x=>x.role==='customer'),roots=(cargo||[]).filter(x=>!x.parent_id);
 return{wr,customer_id:customer?.entity_id||wr?.jobs?.customer_id||null,customer:customer?.entity_id?{id:customer.entity_id}:null,references:(refs||[]).map(x=>({type:x.reference_type,value:x.reference_value})),cargo:roots,handling_units:roots,items:(cargo||[]).filter(x=>x.parent_id),description:wr?.jobs?.description||'',exceptions:[]};
}

export async function compileSavedWRWorkflow(wrId,{force=false,agreementId=null}={}){
 if(!wrId)return null;const organizationId=await getCurrentOrganizationId();
 if(!force){const{data:existing,error}=await supabase.from('workflow_runs_v2').select('id').eq('organization_id',organizationId).eq('target_type',TARGET).eq('target_id',wrId).eq('status','ACTIVE').limit(1).maybeSingle();if(error)throw error;if(existing)return existing}
 const facts=await loadSavedWRFacts(wrId),context=await loadOperationalContext({organizationId,targetType:TARGET,targetId:wrId}).catch(()=>null),choices=await warehouseAgreements(organizationId,facts.customer_id),agreement=chooseAgreement(choices,agreementId||draftAgreementId);
 const mergedFacts={...facts,...(context||{direction:'INBOUND',mode:'WAREHOUSE'}),service:agreement?.service_catalog||null,service_agreement:agreement?{id:agreement.id}:null};
 const blueprint=await resolveTransactionBlueprint({organizationId,transactionType:TARGET,facts:mergedFacts}),requirements=compileRequirements({agreement,systemRequirements:blueprintRequirements(blueprint),facts:mergedFacts});
 return createCompiledWorkflow({organizationId,targetType:TARGET,targetId:wrId,agreement,operationalContext:context,requirements,workflowCode:blueprint?.code||'WR_STANDARD'});
}

let wrapped=false;
export function installWRCanonicalCreateHook(){if(wrapped)return;wrapped=true;const attach=()=>{const current=window.nodaraWROpen;if(typeof current!=='function'||current.__canonicalWrapped)return false;const wrappedOpen=async function(wrId,...args){try{await compileSavedWRWorkflow(wrId,{agreementId:draftAgreementId})}catch(error){console.error('WR canonical workflow compilation failed',error)}return current.call(this,wrId,...args)};wrappedOpen.__canonicalWrapped=true;window.nodaraWROpen=wrappedOpen;return true};if(!attach()){let tries=0;const timer=setInterval(()=>{tries++;if(attach()||tries>40)clearInterval(timer)},100)}}

window.nodaraWRCanonical={collectDraftFacts:collectWRDraftFacts,buildDraftPlan:buildWRDraftPlan,compileSaved:compileSavedWRWorkflow,describeProvenance,selectDraftAgreement:selectWRDraftAgreement,installCreateHook:installWRCanonicalCreateHook};installWRCanonicalCreateHook();
