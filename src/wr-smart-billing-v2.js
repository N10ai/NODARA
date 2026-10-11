import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const upper=v=>String(v||'').trim().toUpperCase();
function top(cargo){return(cargo||[]).filter(x=>!x.parent_id)}
function qtyByPackage(cargo,packageType){return top(cargo).filter(x=>upper(x.package_type)===upper(packageType)).reduce((s,x)=>s+Math.max(1,n(x.quantity)),0)}
function grossLb(cargo){return top(cargo).reduce((s,x)=>s+n(x.weight_lb)*Math.max(1,n(x.quantity)||1),0)}
function volumeCbm(cargo){return top(cargo).reduce((s,x)=>{const l=n(x.length_in),w=n(x.width_in),h=n(x.height_in),q=Math.max(1,n(x.quantity)||1);return s+(l&&w&&h?(l*w*h*0.000016387064)*q:0)},0)}
function pieces(cargo){return top(cargo).reduce((s,x)=>s+Math.max(1,n(x.quantity)||1),0)}
export function quantityForBillingRule(rule,cargo=[]){const basis=upper(rule.basis||rule.unit);if(['WR','JOB','RECEIPT','TRANSACTION','EA'].includes(basis))return 1;if(['PALLET','SKID','CRATE','CARTON','BOX','DRUM','BAG','TOTE','CONTAINER'].includes(basis))return qtyByPackage(cargo,basis);if(['PIECE','PCS','PC','LABEL'].includes(basis))return pieces(cargo);if(basis==='LB')return grossLb(cargo);if(basis==='KG')return grossLb(cargo)*0.45359237;if(basis==='CBM')return volumeCbm(cargo);return null}
function amount(rule,quantity){const raw=n(quantity)*n(rule.rate),min=rule.minimum_charge==null?null:n(rule.minimum_charge),max=rule.maximum_charge==null?null:n(rule.maximum_charge);let amount=raw;if(min!=null)amount=Math.max(amount,min);if(max!=null)amount=Math.min(amount,max);return amount}
async function loadWR(wrId){const{data:wr,error}=await supabase.from('warehouse_receipts').select('id,job_id,organization_id,jobs(customer_id)').eq('id',wrId).single();if(error)throw error;const{data:cargo,error:ce}=await supabase.from('cargo_units').select('id,parent_id,package_type,quantity,weight_lb,length_in,width_in,height_in').eq('job_id',wr.job_id);if(ce)throw ce;return{wr,cargo:cargo||[]}}
async function activeAgreementId(wrId){const org=await getCurrentOrganizationId();const{data,error}=await supabase.from('workflow_runs_v2').select('agreement_id').eq('organization_id',org).eq('target_type','WAREHOUSE_RECEIPT').eq('target_id',wrId).order('started_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data?.agreement_id||null}
export async function syncWRBillingFromAgreement(id,{event='WR_CREATED'}={}){
 const org=await getCurrentOrganizationId();
 const{data:tx,error}=await supabase.from('transactions').select('id').eq('organization_id',org).eq('transaction_type','WAREHOUSE_RECEIPT').eq('domain_record_id',id).single();if(error)throw error;
 const{data,error:pricingError}=await supabase.rpc('nodara_sync_commercial_event',{p_transaction_id:tx.id,p_event:event==='WR_CREATED'?'OPERATION_CREATED':event});if(pricingError)throw pricingError;return data;
}
export async function recordWRBillableEvent(wrId,event){return syncWRBillingFromAgreement(wrId,{event})}
function install(){let attempts=0;const timer=setInterval(()=>{attempts++;const current=window.nodaraWROpen;if(typeof current!=='function'||current.__billingWrapped){if(attempts>50||current?.__billingWrapped)clearInterval(timer);return}const wrapped=async function(wrId,...args){const result=await current.call(this,wrId,...args);setTimeout(()=>syncWRBillingFromAgreement(wrId,{event:'WR_CREATED'}).catch(e=>console.warn('WR smart billing unavailable',e)),250);return result};wrapped.__billingWrapped=true;window.nodaraWROpen=wrapped;clearInterval(timer)},100)}
window.nodaraWRBilling={sync:syncWRBillingFromAgreement,event:recordWRBillableEvent,quantityForBillingRule};install();
