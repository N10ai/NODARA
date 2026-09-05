import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';
import './consolidation-readiness-enhancer.js';

const readinessStyle=document.createElement('link');readinessStyle.rel='stylesheet';readinessStyle.href='./consolidation-readiness.css?v=20260905-0655';document.head.appendChild(readinessStyle);
const main=document.getElementById('main');
const wait=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const style=document.createElement('style');style.textContent=`.pickup-wr-source{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 16px;padding:13px 15px;border:1px solid color-mix(in srgb,var(--module-accent,#35d0d0) 38%,transparent);border-radius:14px;background:color-mix(in srgb,var(--module-accent,#35d0d0) 8%,transparent)}.pickup-wr-source>div{display:flex;flex-direction:column;gap:2px;min-width:0}.pickup-wr-source b{font-size:13px}.pickup-wr-source small{color:var(--muted);white-space:normal}.pickup-wr-source .eyebrow{font-size:8px}@media(max-width:760px){.pickup-wr-source{align-items:flex-start;flex-direction:column}.pickup-wr-source .status-pill{align-self:flex-start}}`;document.head.appendChild(style);
async function waitFor(sel,tries=30){for(let i=0;i<tries;i++){const el=document.querySelector(sel);if(el)return el;await wait(80)}return null}
function currentOrderNumber(){return main.querySelector('.record-header h1.title')?.textContent?.trim()||''}
function pending(){return window.__nodaraPendingWRLink||null}
function clearPending(){delete window.__nodaraPendingWRLink}
async function setSelect(selector,value){if(!value)return;const el=await waitFor(selector);if(!el||![...el.options].some(o=>o.value===value))return;el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));await wait(180)}
async function prefillWR(order){
  window.__nodaraPendingWRLink={source_type:'TRANSPORT_ORDER',source_id:order.id,source_number:order.order_number,relationship:'CREATED_WR'};
  window.nodaraReceive?.();
  if(!await waitFor('#wr-description'))return;
  await setSelect('[data-party="customer"]',order.customer_id);
  await setSelect('[data-party="shipper"]',order.pickup_entity_id);
  await setSelect('[data-party="carrier"]',order.carrier_id);
  const ref=await waitFor('[data-ref-value="0"]');
  if(ref){ref.value=order.customer_reference||order.order_number;ref.dispatchEvent(new Event('input',{bubbles:true}))}
  const packageMode=document.querySelector('[data-mode="package"]');if(packageMode&&!packageMode.classList.contains('selected'))packageMode.click();
  await wait(80);
  const overview=document.getElementById('overview');
  if(overview&&!document.getElementById('pickup-wr-source')){
    const banner=document.createElement('div');banner.id='pickup-wr-source';banner.className='pickup-wr-source';
    const expected=[order.pieces?`${order.pieces} pcs`:null,order.weight?`${order.weight} ${order.weight_unit||'KG'}`:null].filter(Boolean).join(' · ');
    banner.innerHTML=`<div><span class="eyebrow">PREFILLED FROM PICKUP</span><b>${order.order_number}</b><small>${order.pickup_name||order.pickup_address||'Pickup'} → ${order.delivery_name||order.delivery_address||'Warehouse'}${expected?` · Expected ${expected}`:''}</small></div><span class="status-pill">Linked</span>`;
    overview.prepend(banner);
  }
}
async function loadAndPrefill(){
  const number=currentOrderNumber();if(!number)return;
  const org=await getCurrentOrganizationId();
  const {data,error}=await supabase.from('transport_orders').select('*').eq('organization_id',org).eq('order_number',number).maybeSingle();
  if(error)return alert(error.message);if(!data)return alert('Could not find this transport order.');
  await prefillWR(data);
}
function installWROpenBridge(){
  const fn=window.nodaraWROpen;if(typeof fn!=='function'||fn.__opsLinkWrapped)return false;
  const wrapped=async function(wrId,...args){
    const p=pending();
    if(p?.source_id&&wrId){
      try{
        const org=await getCurrentOrganizationId();
        const {error}=await supabase.from('operational_links').upsert({organization_id:org,source_type:p.source_type,source_id:p.source_id,target_type:'WAREHOUSE_RECEIPT',target_id:wrId,relationship:p.relationship,metadata:{source_number:p.source_number,created_from:'pickup_receive_workflow'}},{onConflict:'organization_id,source_type,source_id,target_type,target_id,relationship'});
        if(error)console.error('NODARA operational link',error);
      }finally{clearPending()}
    }
    return fn.call(this,wrId,...args);
  };
  wrapped.__opsLinkWrapped=true;window.nodaraWROpen=wrapped;return true;
}
document.addEventListener('click',e=>{
  if(e.target.closest('#to-link-wr')){e.preventDefault();e.stopImmediatePropagation();loadAndPrefill()}
  if(e.target.closest('#wr-cancel'))clearPending();
},true);
let bridgeTries=0;const bridgeTimer=setInterval(()=>{bridgeTries++;if(installWROpenBridge()||bridgeTries>40)clearInterval(bridgeTimer)},150);
