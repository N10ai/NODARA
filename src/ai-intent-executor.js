import { markIntent } from './ai-intent-engine.js';

const wait=(sel,ms=6500)=>new Promise((resolve,reject)=>{const first=document.querySelector(sel);if(first)return resolve(first);const until=Date.now()+ms,t=setInterval(()=>{const el=document.querySelector(sel);if(el){clearInterval(t);resolve(el)}else if(Date.now()>until){clearInterval(t);reject(new Error(`Could not open ${sel}`))}},80)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const resolved=(result,key)=>result.resolution?.entities?.[key]?.status==='RESOLVED'?result.resolution.entities[key]:null;
function setValue(sel,value,{change=true,input=true}={}){const el=document.querySelector(sel);if(!el||value==null||value==='')return false;el.value=String(value);if(input)el.dispatchEvent(new Event('input',{bubbles:true}));if(change)el.dispatchEvent(new Event('change',{bubbles:true}));return true}
function setSelectByValue(sel,value){const el=document.querySelector(sel);if(!el||!value)return false;const v=String(value),opt=[...el.options].find(o=>String(o.value).toUpperCase()===v.toUpperCase()||o.textContent.trim().toUpperCase().startsWith(v.toUpperCase()));if(!opt)return false;el.value=opt.value;el.dispatchEvent(new Event('change',{bubbles:true}));return true}
function firstCargo(intent){return intent?.facts?.cargo?.[0]||null}
function primaryReference(intent){return intent?.facts?.references?.[0]|| (intent?.facts?.reference?{type:'CUSTOMER_REF',value:intent.facts.reference}:null)}

async function applyWR(result){
 const f=result.intent.facts,c=firstCargo(result.intent),ref=primaryReference(result.intent);window.nodaraReceive?.();await wait('.wr-object-head');
 for(const [key,role] of [['customer_name','customer'],['shipper_name','shipper'],['consignee_name','consignee'],['carrier_name','carrier']]){const r=resolved(result,key),el=document.querySelector(`[data-party="${role}"]`);if(r&&el){el.value=r.entity_id;el.dispatchEvent(new Event('change',{bubbles:true}));await sleep(90)}}
 setValue('#wr-description',f.commodity||c?.description,{change:false});if(ref){setSelectByValue('[data-ref-type="0"]',ref.type);setValue('[data-ref-value="0"]',ref.value,{change:false})}
 if(c){setSelectByValue('#outer-type',c.package_type);setValue('#outer-qty',c.quantity||c.pieces||1);await sleep(120);const type=document.querySelector('select[id^="cv3-"][id$="-type"]');if(type){const id=type.id.match(/^cv3-(.+)-type$/)?.[1];if(id){setSelectByValue(`#${type.id}`,c.package_type);if(c.quantity||c.pieces)setValue(`#cv3-${id}-qty`,c.quantity||c.pieces);if(c.weight!=null)setValue(`#cv3-${id}-weight`,c.weight);for(const [k,v] of [['l',c.length],['w',c.width],['h',c.height]])if(v!=null)setValue(`#cv3-${id}-${k}`,v)}}}
 window.dispatchEvent(new CustomEvent('nodara:ai-draft-prepared',{detail:{type:'WAREHOUSE_RECEIPT',run_id:result.run_id}}));
}
async function applyCR(result){
 const f=result.intent.facts,customer=resolved(result,'customer_name'),ref=primaryReference(result.intent);window.nodaraCRNew?.();await wait('#cr-customer');if(customer)setValue('#cr-customer',customer.entity_id);if(ref)setValue('#cr-ref',ref.value,{change:false});const search=f.reference||ref?.value||firstCargo(result.intent)?.part_number||firstCargo(result.intent)?.sku;if(search){setValue('#cr-search',search,{change:false});document.querySelector('#cr-search')?.dispatchEvent(new Event('input',{bubbles:true}))}
 window.dispatchEvent(new CustomEvent('nodara:ai-draft-prepared',{detail:{type:'CARGO_RELEASE',run_id:result.run_id}}));
}
async function applyTransport(result){
 const f=result.intent.facts,c=firstCargo(result.intent),customer=resolved(result,'customer_name'),carrier=resolved(result,'carrier_name');await window.nodaraOperations?.transportOrders?.('ALL');const add=await wait('#ops-new-order');add.click();await wait('#to-type');setSelectByValue('#to-type',f.order_type||'PICKUP');if(customer)setValue('#to-customer',customer.entity_id);if(carrier)setValue('#to-carrier',carrier.entity_id);setValue('#to-customer-ref',f.reference,{change:false});setValue('#to-pickup-name',f.pickup_name,{change:false});setValue('#to-pickup-address',f.pickup_address||f.origin,{change:false});setValue('#to-delivery-name',f.delivery_name,{change:false});setValue('#to-delivery-address',f.delivery_address||f.destination,{change:false});setValue('#to-start',f.scheduled_start,{change:false});setValue('#to-end',f.scheduled_end,{change:false});if(c){setValue('#to-pieces',c.pieces||c.quantity,{change:false});setValue('#to-weight',c.weight,{change:false});setSelectByValue('#to-wunit',c.weight_unit)}setValue('#to-equipment',f.equipment,{change:false});window.dispatchEvent(new CustomEvent('nodara:ai-draft-prepared',{detail:{type:'TRANSPORT_ORDER',run_id:result.run_id}}));
}
async function applyShipment(result){
 const f=result.intent.facts,c=firstCargo(result.intent),customer=resolved(result,'customer_name'),shipper=resolved(result,'shipper_name'),consignee=resolved(result,'consignee_name'),carrier=resolved(result,'carrier_name');await window.nodaraOperations?.shipments?.('ALL');const add=await wait('#ops-new-shipment');add.click();await wait('#sh-mode');setSelectByValue('#sh-mode',f.mode||'AIR');await sleep(120);setSelectByValue('#sh-direction',f.direction);if(customer)setValue('#sh-customer',customer.entity_id);if(shipper)setValue('#sh-shipper',shipper.entity_id);if(consignee)setValue('#sh-consignee',consignee.entity_id);if(carrier)setValue('#sh-carrier',carrier.entity_id);setValue('#sh-origin',f.origin,{change:false});setValue('#sh-dest',f.destination,{change:false});setValue('#sh-ref',f.reference,{change:false});if(c){setValue('#sh-pieces',c.pieces||c.quantity,{change:false});setValue('#sh-weight',c.weight,{change:false});setSelectByValue('#sh-wunit',c.weight_unit)}await sleep(120);setValue('#mode-service_type',f.service_type,{change:false});window.dispatchEvent(new CustomEvent('nodara:ai-draft-prepared',{detail:{type:'SHIPMENT',run_id:result.run_id}}));
}
async function applyEntity(result){
 const f=result.intent.facts;window.nodaraEntities?.();const add=await wait('#new-entity');add.click();await wait('#ent-name');setValue('#ent-name',f.entity_name||f.customer_name||f.carrier_name||f.shipper_name||f.consignee_name,{change:false});for(const role of f.entity_roles||[]){const b=document.querySelector(`[data-role="${String(role).toLowerCase()}"]`);if(b&&!b.classList.contains('selected'))b.click()}window.dispatchEvent(new CustomEvent('nodara:ai-draft-prepared',{detail:{type:'ENTITY',run_id:result.run_id}}));
}
async function applyServiceAgreement(result){
 const customer=resolved(result,'customer_name'),service=result.resolution?.service;if(!customer)throw new Error('Resolve the customer before opening a Service Agreement draft.');if(service?.status!=='RESOLVED')throw new Error('Resolve the service before opening a Service Agreement draft.');window.nodaraEntities?.();await wait('#entity-list');const row=await wait(`[data-entity="${customer.entity_id}"]`);row.click();await wait('[data-canonical-tab="agreements"]');document.querySelector('[data-canonical-tab="agreements"]')?.click();const add=await wait('[data-new-agreement]');add.click();const sel=await wait('[data-a-service]');sel.value=service.service_id;sel.dispatchEvent(new Event('change',{bubbles:true}));setValue('[data-a-name]',`${service.name} Agreement`,{change:false});setSelectByValue('[data-a-status]','DRAFT');window.dispatchEvent(new CustomEvent('nodara:ai-draft-prepared',{detail:{type:'SERVICE_AGREEMENT',run_id:result.run_id}}));
}
async function applyRFQ(result){const f=result.intent.facts,c=firstCargo(result.intent);sessionStorage.setItem('nodara:rfq-draft',JSON.stringify({mode:f.mode||'UNDETERMINED',origin:f.origin||'',destination:f.destination||'',pieces:c?.pieces||c?.quantity||'',weight:c?.weight?`${c.weight} ${c.weight_unit||''}`.trim():'',dimensions:c?.length!=null?`${c.length} × ${c.width} × ${c.height} ${c.dimension_unit||''}`.trim():'',raw:result.intent.summary}));window.nodaraGo?.('pricing_quotes')}
async function openIntent(result){const t=result.intent.transaction_type;if(t==='WAREHOUSE_RECEIPT')return window.nodaraGo?.('wr');if(t==='CARGO_RELEASE')return window.nodaraGo?.('release');if(t==='TRANSPORT_ORDER')return window.nodaraOperations?.transportOrders?.('ALL');if(t==='SHIPMENT')return window.nodaraOperations?.shipments?.('ALL');if(t==='ENTITY')return window.nodaraEntities?.();if(t==='RFQ')return window.nodaraGo?.('pricing_quotes')}

export function canExecuteIntent(result){
 const i=result.intent;if(result.resolution?.has_ambiguity)return{ok:false,reason:'Resolve ambiguous master-data matches first.'};if(i.intent_type==='UPDATE_TRANSACTION')return{ok:false,reason:'Open the exact transaction before applying an AI update; NODARA will not guess the target record.'};if(i.intent_type==='QUERY')return{ok:false,reason:'This is an informational request, not a draft action.'};if(i.transaction_type==='SERVICE_AGREEMENT'&&(!resolved(result,'customer_name')||result.resolution?.service?.status!=='RESOLVED'))return{ok:false,reason:'Customer and service must resolve uniquely.'};return{ok:true,reason:null};
}
export async function executeIntent(result){
 const gate=canExecuteIntent(result);if(!gate.ok)throw new Error(gate.reason);await markIntent(result.run_id,'CONFIRMED',{resolution:result.resolution});const i=result.intent;
 try{
  if(i.action==='OPEN'||i.intent_type==='OPEN')await openIntent(result);
  else if(i.transaction_type==='WAREHOUSE_RECEIPT')await applyWR(result);
  else if(i.transaction_type==='CARGO_RELEASE')await applyCR(result);
  else if(i.transaction_type==='TRANSPORT_ORDER')await applyTransport(result);
  else if(i.transaction_type==='SHIPMENT')await applyShipment(result);
  else if(i.transaction_type==='ENTITY')await applyEntity(result);
  else if(i.transaction_type==='SERVICE_AGREEMENT')await applyServiceAgreement(result);
  else if(i.transaction_type==='RFQ'||i.intent_type==='RFQ')await applyRFQ(result);
  else throw new Error('This intent does not have a safe executor yet.');
  await markIntent(result.run_id,'EXECUTED',{resolution:result.resolution});return true;
 }catch(error){await markIntent(result.run_id,'FAILED',{resolution:result.resolution,errorMessage:error.message||String(error)});throw error}
}
window.nodaraAIIntentExecutor={execute:executeIntent,canExecute:canExecuteIntent};
