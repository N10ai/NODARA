import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';
import './consolidation-readiness-enhancer.js';

const readinessStyle=document.createElement('link');readinessStyle.rel='stylesheet';readinessStyle.href='./consolidation-readiness.css?v=20260905-0655';document.head.appendChild(readinessStyle);
const main=document.getElementById('main');
const wait=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const style=document.createElement('style');style.textContent=`.pickup-wr-source{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 16px;padding:13px 15px;border:1px solid color-mix(in srgb,var(--module-accent,#35d0d0) 38%,transparent);border-radius:14px;background:color-mix(in srgb,var(--module-accent,#35d0d0) 8%,transparent)}.pickup-wr-source>div{display:flex;flex-direction:column;gap:2px;min-width:0}.pickup-wr-source b{font-size:13px}.pickup-wr-source small{color:var(--muted);white-space:normal}.pickup-wr-source .eyebrow{font-size:8px}.convert-wr-action{white-space:nowrap}@media(max-width:760px){.pickup-wr-source{align-items:flex-start;flex-direction:column}.pickup-wr-source .status-pill{align-self:flex-start}}`;document.head.appendChild(style);
async function waitFor(sel,tries=30){for(let i=0;i<tries;i++){const el=document.querySelector(sel);if(el)return el;await wait(80)}return null}
function currentOrderNumber(){return main.querySelector('.record-header h1.title')?.textContent?.trim()||main.querySelector('.record-number')?.textContent?.trim()||''}
function pending(){return window.__nodaraPendingWRLink||null}
function clearPending(){delete window.__nodaraPendingWRLink;delete window.__nodaraPendingWRExpectedCargo}
async function setSelect(selector,value){if(!value)return;const el=await waitFor(selector);if(!el||![...el.options].some(o=>o.value===value))return;el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));await wait(180)}
function numberOf(source,...keys){for(const k of keys){const n=Number(source?.[k]);if(Number.isFinite(n)&&n>0)return n}return 0}
function sourceExpectedCargo(source){
  const qty=Math.max(1,Math.round(numberOf(source,'pieces','quantity','package_count','packages')||1));
  const totalWeight=numberOf(source,'weight','gross_weight','weight_lb','gross_weight_lb');
  const weightUnit=String(source.weight_unit||source.gross_weight_unit||(source.weight_lb||source.gross_weight_lb?'LB':'KG')).toUpperCase();
  const pkg=String(source.package_type||source.packaging||source.unit_type||'CARTON').toUpperCase();
  const description=source.commodity||source.description||source.cargo_description||'';
  if(!totalWeight&&!description&&!numberOf(source,'pieces','quantity','package_count','packages'))return [];
  return [{package_type:pkg,quantity:qty,description,gross_weight:totalWeight?totalWeight/qty:null,weight_unit:weightUnit,length:source.length||null,width:source.width||null,height:source.height||null,dimension_unit:source.dimension_unit||'IN',part_number:source.part_number||null,sku:source.sku||null,barcode:null}];
}
function sourceLabel(type){return type==='SHIPMENT'?'Shipment':type==='TRANSPORT_ORDER'?'Transport order':'Source record'}
async function prefillWR(source,{sourceType,sourceNumber}){
  window.__nodaraPendingWRLink={source_type:sourceType,source_id:source.id,source_number:sourceNumber,relationship:'CREATED_WR'};
  window.__nodaraPendingWRExpectedCargo=sourceExpectedCargo(source);
  window.nodaraReceive?.();
  if(!await waitFor('#wr-description'))return;
  await setSelect('[data-party="customer"]',source.customer_id||source.consignee_id);
  await setSelect('[data-party="shipper"]',source.pickup_entity_id||source.shipper_id||source.origin_entity_id);
  await setSelect('[data-party="carrier"]',source.carrier_id);
  const ref=await waitFor('[data-ref-value="0"]');
  if(ref){ref.value=source.customer_reference||source.reference||sourceNumber;ref.dispatchEvent(new Event('input',{bubbles:true}))}
  const desc=document.getElementById('wr-description');if(desc&&!desc.value&&(source.commodity||source.description))desc.value=source.commodity||source.description;
  const packageMode=document.querySelector('[data-mode="package"]');if(packageMode&&!packageMode.classList.contains('selected'))packageMode.click();
  await wait(100);
  const overview=document.getElementById('overview');
  if(overview&&!document.getElementById('pickup-wr-source')){
    const banner=document.createElement('div');banner.id='pickup-wr-source';banner.className='pickup-wr-source';
    const pieces=numberOf(source,'pieces','quantity','package_count','packages'),weight=numberOf(source,'weight','gross_weight','weight_lb','gross_weight_lb');
    const expected=[pieces?`${pieces} pcs`:null,weight?`${weight} ${source.weight_unit||source.gross_weight_unit||(source.weight_lb||source.gross_weight_lb?'LB':'KG')}`:null].filter(Boolean).join(' · ');
    const from=source.pickup_name||source.origin_name||source.shipper_name||source.pickup_address||source.origin||'';
    const to=source.delivery_name||source.destination_name||source.delivery_address||source.destination||'Warehouse';
    banner.innerHTML=`<div><span class="eyebrow">CONVERTED FROM ${sourceLabel(sourceType).toUpperCase()}</span><b>${sourceNumber}</b><small>${[from,to].filter(Boolean).join(' → ')}${expected?` · Expected ${expected}`:''}</small></div><span class="status-pill">Linked source</span>`;
    overview.prepend(banner);
  }
}
async function findSource(sourceType,sourceId=null){
  const org=await getCurrentOrganizationId(),number=currentOrderNumber();
  if(sourceType==='TRANSPORT_ORDER'){
    let q=supabase.from('transport_orders').select('*').eq('organization_id',org);q=sourceId?q.eq('id',sourceId):q.eq('order_number',number);const{data,error}=await q.maybeSingle();if(error)throw error;return data?{record:data,type:'TRANSPORT_ORDER',number:data.order_number}:null;
  }
  if(sourceType==='SHIPMENT'){
    let q=supabase.from('shipments').select('*');q=sourceId?q.eq('id',sourceId):q.eq('shipment_number',number);const{data,error}=await q.maybeSingle();if(error)throw error;return data?{record:data,type:'SHIPMENT',number:data.shipment_number}:null;
  }
  return null;
}
async function detectSource(){
  const number=currentOrderNumber();if(!number||/^WR/i.test(number))return null;
  try{const t=await findSource('TRANSPORT_ORDER');if(t)return t}catch{}
  try{const s=await findSource('SHIPMENT');if(s)return s}catch{}
  return null;
}
async function convertCurrent(sourceType,sourceId=null){
  try{const source=await findSource(sourceType,sourceId);if(!source)return alert('Could not find this source record.');await prefillWR(source.record,{sourceType:source.type,sourceNumber:source.number})}catch(e){alert(e.message||'Could not convert this record to a Warehouse Receipt.')}
}
function installWROpenBridge(){
  const fn=window.nodaraWROpen;if(typeof fn!=='function'||fn.__opsLinkWrapped)return false;
  const wrapped=async function(wrId,...args){
    const p=pending();
    if(p?.source_id&&wrId){
      try{
        const org=await getCurrentOrganizationId();
        const {error}=await supabase.from('operational_links').upsert({organization_id:org,source_type:p.source_type,source_id:p.source_id,target_type:'WAREHOUSE_RECEIPT',target_id:wrId,relationship:p.relationship,metadata:{source_number:p.source_number,created_from:'convert_to_wr_workflow'}},{onConflict:'organization_id,source_type,source_id,target_type,target_id,relationship'});
        if(error)console.error('NODARA operational link',error);
      }finally{clearPending()}
    }
    return fn.call(this,wrId,...args);
  };
  wrapped.__opsLinkWrapped=true;window.nodaraWROpen=wrapped;return true;
}
let actionBusy=false,lastActionKey='';
async function installConvertAction(){
  if(actionBusy||main.querySelector('[data-convert-wr]'))return;actionBusy=true;
  try{
    const source=await detectSource();if(!source)return;
    const key=`${source.type}:${source.record.id}`;if(lastActionKey===key&&main.querySelector('[data-convert-wr]'))return;lastActionKey=key;
    const header=main.querySelector('.record-header');if(!header)return;
    const host=header.querySelector('.record-actions,.header-actions,.record-header-actions')||header;
    const b=document.createElement('button');b.type='button';b.className='secondary compact-btn convert-wr-action';b.dataset.convertWr=source.type;b.dataset.sourceId=source.record.id;b.textContent='Convert to WR';host.appendChild(b);
  }finally{actionBusy=false}
}
document.addEventListener('click',e=>{
  const convert=e.target.closest('[data-convert-wr]');
  if(convert){e.preventDefault();e.stopImmediatePropagation();convertCurrent(convert.dataset.convertWr,convert.dataset.sourceId);return}
  if(e.target.closest('#to-link-wr')){e.preventDefault();e.stopImmediatePropagation();convertCurrent('TRANSPORT_ORDER')}
  if(e.target.closest('#wr-cancel'))clearPending();
},true);
let bridgeTries=0;const bridgeTimer=setInterval(()=>{bridgeTries++;if(installWROpenBridge()||bridgeTries>40)clearInterval(bridgeTimer)},150);
new MutationObserver(()=>setTimeout(installConvertAction,100)).observe(main,{childList:true,subtree:true});
setTimeout(installConvertAction,700);
