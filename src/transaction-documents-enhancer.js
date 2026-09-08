import { supabase } from './supabase-client.js';
import { loadTransactionReadModel } from './transaction-read-model.js?v=20260907-workspace3';
import { mountTransactionDocuments, documentsPlaceholder } from './transaction-documents-workspace.js?v=20260907-docs1';

const main=document.getElementById('main');
let busy=false,lastKey='';
const label=v=>String(v||'').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

async function context(){
  if(!main)return null;
  if(main.dataset.wrCore==='1'){
    const number=main.querySelector('.wr-modern-title .title')?.textContent?.trim();if(!number||number==='New Warehouse Receipt')return null;
    const{data}=await supabase.from('warehouse_receipts').select('id').eq('receipt_number',number).maybeSingle();return data?{type:'WAREHOUSE_RECEIPT',id:data.id}:null;
  }
  if(main.querySelector('#crc-back')){const number=main.querySelector('.record-number')?.textContent?.trim();if(!number)return null;const{data}=await supabase.from('cargo_releases').select('id').eq('release_number',number).maybeSingle();return data?{type:'CARGO_RELEASE',id:data.id}:null}
  const eye=main.querySelector('.record-header .eyebrow')?.textContent?.trim()||'',number=main.querySelector('.record-header .title')?.textContent?.trim();if(!number||!eye.startsWith('Operations ·'))return null;const subtype=eye.split('·').pop().trim().toUpperCase();
  if(['AIR','OCEAN','GROUND'].includes(subtype)){const{data}=await supabase.from('shipments').select('id').eq('shipment_number',number).maybeSingle();return data?{type:'SHIPMENT',id:data.id}:null}
  if(['PICKUP','DELIVERY','TRANSFER','DRAYAGE'].includes(subtype)){const{data}=await supabase.from('transport_orders').select('id').eq('order_number',number).maybeSingle();return data?{type:'TRANSPORT_ORDER',id:data.id}:null}
  return null;
}
async function mount(force=false){
  if(busy||!main||main.dataset.txwTab!=='documents')return;
  const panel=main.querySelector('.txw-shell [data-txw-panel]');if(!panel)return;
  busy=true;try{const ctx=await context();if(!ctx)return;const key=`${ctx.type}:${ctx.id}`;if(!force&&lastKey===key&&panel.dataset.txwDocsMounted==='1')return;panel.innerHTML=documentsPlaceholder();const model=await loadTransactionReadModel(ctx.type,ctx.id);if(!model)return;const refreshModel=async()=>{window.nodaraTransactionWorkspace?.invalidate?.(ctx.type,ctx.id);return loadTransactionReadModel(ctx.type,ctx.id)};await mountTransactionDocuments(panel,{ctx,model,refreshModel});panel.dataset.txwDocsMounted='1';lastKey=key}catch(e){panel.innerHTML=`<div class="txw-empty">Documents unavailable: ${String(e.message||e)}</div>`;console.warn('[NODARA] documents workspace',e)}finally{busy=false}
}
function schedule(force=false){setTimeout(()=>mount(force),220)}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-txw-tab="documents"]'))schedule(true)});
if(main)new MutationObserver(()=>{if(main.dataset.txwTab==='documents')schedule(false)}).observe(main,{childList:true});
setTimeout(()=>mount(false),1700);
