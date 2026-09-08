import { supabase } from './supabase-client.js';
import { transactionUx,workflowProgress } from './transaction-ux-contract.js?v=20260908-guided1';

const main=document.getElementById('main');
let busy=false,lastKey='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function descriptor(){
 if(!main)return null;
 if(main.dataset.wrNativeCanonical==='1'){
  const number=main.querySelector('.wr-native-shell .txw-title')?.textContent?.trim();
  if(number)return{type:'WAREHOUSE_RECEIPT',table:'warehouse_receipts',field:'receipt_number',number};
 }
 const eye=main.querySelector('.record-header .eyebrow')?.textContent?.trim()||'';
 const number=main.querySelector('.record-header .title')?.textContent?.trim();
 if(main.querySelector('#crc-back')){const n=main.querySelector('.record-number')?.textContent?.trim();if(n)return{type:'CARGO_RELEASE',table:'cargo_releases',field:'release_number',number:n}}
 if(!number)return null;
 const subtype=eye.split('·').pop()?.trim().toUpperCase();
 if(['AIR','OCEAN','GROUND'].includes(subtype))return{type:'SHIPMENT',table:'shipments',field:'shipment_number',number};
 if(['PICKUP','DELIVERY','TRANSFER','DRAYAGE'].includes(subtype))return{type:'TRANSPORT_ORDER',table:'transport_orders',field:'order_number',number};
 return null;
}
async function context(d){const{data,error}=await supabase.from(d.table).select('id,organization_id').eq(d.field,d.number).maybeSingle();if(error)throw error;return data?{...d,id:data.id,organization_id:data.organization_id}:null}
async function loadFlow(ctx){
 const fallback=transactionUx(ctx.type).steps;
 const [{data:def},{data:progress}]=await Promise.all([
  supabase.from('workflow_definitions').select('name,steps').eq('organization_id',ctx.organization_id).eq('transaction_type',ctx.type).eq('is_active',true).maybeSingle(),
  supabase.from('workflow_progress').select('completed_steps').eq('organization_id',ctx.organization_id).eq('transaction_type',ctx.type).eq('transaction_id',ctx.id).maybeSingle()
 ]);
 return{name:def?.name||transactionUx(ctx.type).label,steps:Array.isArray(def?.steps)?def.steps:fallback,completed:Array.isArray(progress?.completed_steps)?progress.completed_steps:[]};
}
function targetTab(step){return step?.action_tab||({CHECK_IN:'parties',INSPECT:'cargo',RECEIVE:'cargo',PUT_AWAY:'execution',NOTIFY:'documents'})[step?.code]||'overview'}
function activateTab(tab){
 const native=main.querySelector(`[data-wrn-tab="${tab}"]`);if(native){native.click();return}
 const common=main.querySelector(`[data-txw-tab="${tab}"]`);if(common){common.click();return}
}
function render(anchor,ctx,flow){
 main.querySelector('.tx-guidance')?.remove();
 const p=workflowProgress(flow.steps,flow.completed),current=flow.steps[p.current]||null;
 const el=document.createElement('section');el.className='tx-guidance';el.style.setProperty('--tx-steps',String(Math.max(flow.steps.length,1)));
 el.innerHTML=`<div class="tx-guidance-head"><div><b>${esc(flow.name)}</b><small>${p.complete?'Complete':`${p.done.size}/${p.total} complete`}</small></div><span class="tx-completion ${p.complete?'ok':''}">${p.complete?'✓ Complete':'Live workflow'}</span></div><div class="tx-progress">${flow.steps.map((s,i)=>`<button class="tx-step ${p.done.has(s.code)?'done':''} ${i===p.current?'current':''}" data-tx-step="${esc(s.code)}" data-tx-tab="${esc(targetTab(s))}"><span class="tx-step-index">${p.done.has(s.code)?'✓':i+1}</span><b>${esc(s.label||s.code)}</b><small>${esc(s.hint||'')}</small></button>`).join('')}</div>${current?`<div class="tx-next-action"><div><b>Next: ${esc(current.label||current.code)}</b><small>${esc(current.hint||'')}</small></div><button class="primary" data-tx-continue="${esc(targetTab(current))}">Continue →</button></div>`:''}`;
 anchor.insertAdjacentElement('afterend',el);
 el.querySelectorAll('[data-tx-tab]').forEach(b=>b.onclick=()=>activateTab(b.dataset.txTab));
 el.querySelector('[data-tx-continue]')?.addEventListener('click',e=>activateTab(e.currentTarget.dataset.txContinue));
}
async function mount(force=false){
 if(busy)return;const d=descriptor();if(!d){lastKey='';main?.querySelector('.tx-guidance')?.remove();return}busy=true;
 try{const ctx=await context(d);if(!ctx)return;const key=`${ctx.type}:${ctx.id}`;if(!force&&key===lastKey&&main.querySelector('.tx-guidance'))return;const flow=await loadFlow(ctx);const anchor=main.querySelector('.wr-native-shell .txw-top,.txw-shell .txw-top,.record-header,.cr-record-head');if(anchor){render(anchor,ctx,flow);lastKey=key}}
 catch(e){console.warn('[NODARA] guided workflow unavailable',e)}finally{busy=false}
}
let timer;function schedule(){clearTimeout(timer);timer=setTimeout(()=>mount(false),80)}
if(main)new MutationObserver(schedule).observe(main,{childList:true,subtree:true});setTimeout(()=>mount(true),350);
window.nodaraRefreshTransactionGuidance=()=>mount(true);
