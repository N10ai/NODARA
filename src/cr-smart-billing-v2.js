import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const upper=v=>String(v||'').trim().toUpperCase();
async function loadRelease(id){const{data:r,error}=await supabase.from('cargo_releases').select('id,customer_id,status,confirmed_at').eq('id',id).single();if(error)throw error;const{data:lines,error:le}=await supabase.from('cargo_release_lines').select('requested_quantity,uom,cargo_unit_id,cargo_units(id,package_type,quantity,weight_lb,length_in,width_in,height_in)').eq('cargo_release_id',id);if(le)throw le;return{r,lines:lines||[]}}
async function agreementId(id){const org=await getCurrentOrganizationId();const{data,error}=await supabase.from('workflow_runs_v2').select('agreement_id').eq('organization_id',org).eq('target_type','CARGO_RELEASE').eq('target_id',id).order('started_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data?.agreement_id||null}
function lineFraction(l){const total=Math.max(n(l.cargo_units?.quantity),n(l.requested_quantity),1);return Math.min(1,n(l.requested_quantity)/total)}
function totalWeightLb(lines){return lines.reduce((s,l)=>s+n(l.cargo_units?.weight_lb)*lineFraction(l),0)}
function totalCbm(lines){return lines.reduce((s,l)=>{const c=l.cargo_units||{},f=lineFraction(l);return s+(n(c.length_in)*n(c.width_in)*n(c.height_in)*0.000016387064*f)},0)}
function qtyPackage(lines,type){return lines.filter(l=>upper(l.cargo_units?.package_type)===type).reduce((s,l)=>s+n(l.requested_quantity||1),0)}
function totalPieces(lines){return lines.reduce((s,l)=>s+n(l.requested_quantity||0),0)}
export function quantityForCRRule(rule,lines=[]){const b=upper(rule.basis||rule.unit);if(['CR','RELEASE','JOB','TRANSACTION','EA'].includes(b))return 1;if(['PALLET','SKID','CRATE','CARTON','BOX','DRUM','BAG','TOTE','CONTAINER'].includes(b))return qtyPackage(lines,b);if(['PIECE','PCS','PC','LABEL'].includes(b))return totalPieces(lines);if(b==='LB')return totalWeightLb(lines);if(b==='KG')return totalWeightLb(lines)*0.45359237;if(b==='CBM')return totalCbm(lines);return null}
function chargeAmount(rule,q){let a=n(rule.rate)*n(q);if(rule.minimum_charge!=null)a=Math.max(a,n(rule.minimum_charge));if(rule.maximum_charge!=null)a=Math.min(a,n(rule.maximum_charge));return a}
export async function syncCRBilling(id,{event='CR_RELEASED'}={}){
 const org=await getCurrentOrganizationId();
 const{data:tx,error}=await supabase.from('transactions').select('id').eq('organization_id',org).eq('transaction_type','CARGO_RELEASE').eq('domain_record_id',id).single();if(error)throw error;
 const{data,error:pricingError}=await supabase.rpc('nodara_sync_commercial_event',{p_transaction_id:tx.id,p_event:event==='WR_CREATED'?'OPERATION_CREATED':event});if(pricingError)throw pricingError;return data;
}
window.nodaraCRBilling={sync:syncCRBilling,quantityForRule:quantityForCRRule};
