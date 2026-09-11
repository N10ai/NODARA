import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
let opening=false;
let canonicalizing=false;
let bundlePromise=null;

function showLoadError(err){
  document.body.classList.remove('wr-canonical-loading');
  main.style.visibility='visible';
  console.error('NODARA Receiving OS failed to load',err);
  if(!main)return;
  main.innerHTML=`<div style="max-width:760px;margin:30px auto;padding:20px"><div class="eyebrow">WAREHOUSE RECEIVING</div><h1 class="title">Receiving OS could not start</h1><div class="notice warning" style="margin-top:16px">${String(err?.message||err||'Unknown module error').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}</div><button class="primary wide" style="margin-top:16px" onclick="location.reload()">Reload NODARA</button></div>`;
}

async function loadBundle(){
  if(!bundlePromise){
    bundlePromise=Promise.all([
      import('./wr-receiving-os-v11.js?v=20260911-core19'),
      import('./wr-canonical-v16.js?v=20260911-v16a'),
      import('./wr-output-studio-v11.js?v=20260911-v16a').catch(e=>{console.warn('WR output studio unavailable',e);return null}),
      import('./wr-cargo-hierarchy-v11.js?v=20260911-v16a').catch(e=>{console.warn('WR cargo hierarchy unavailable',e);return null}),
      import('./wr-units-settings-bridge-v11.js?v=20260911-v16a').catch(e=>{console.warn('WR unit settings bridge unavailable',e);return null}),
      import('./wr-media-components-v9.js?v=20260911-v16a').catch(e=>{console.warn('WR media component unavailable',e);return null}),
      import('./wr-document-scanner-v9b.js?v=20260911-v16a').catch(e=>{console.warn('WR scanner unavailable',e);return null}),
      import('./wr-signature-component-v9.js?v=20260911-v16a').catch(e=>{console.warn('WR signature unavailable',e);return null}),
      import('./wr-os-guard-v10.js?v=20260911-v16a').catch(e=>{console.warn('WR guard unavailable',e);return null})
    ]).then(([os,canonical])=>({os,canonical}));
  }
  return bundlePromise;
}

function beginTransition(){
  document.body.classList.add('wr-canonical-loading');
  main.style.visibility='hidden';
}

async function mountCanonicalFromRenderedWR(){
  if(opening||canonicalizing)return;
  if(main.querySelector('.wr16'))return;
  const receiptNumber=main.querySelector('.wr11 .txw-title')?.textContent?.trim();
  if(!receiptNumber)return;
  canonicalizing=true;
  try{
    const {data:wr,error}=await supabase.from('warehouse_receipts').select('id').eq('receipt_number',receiptNumber).maybeSingle();
    if(error)throw error;
    if(!wr?.id)return;
    const {canonical}=await loadBundle();
    if(typeof canonical?.mountWarehouseReceiptV16!=='function')throw new Error('Canonical WR experience is missing.');
    await canonical.mountWarehouseReceiptV16(wr.id,{mode:'guided'});
  }catch(e){
    console.error('Could not hand WR to canonical experience',e);
  }finally{
    canonicalizing=false;
  }
}

async function openEditor(){
  if(opening)return;
  opening=true;
  beginTransition();
  try{
    window.nodaraSetActive?.('wr');
    const {os,canonical}=await loadBundle();
    if(typeof os?.openNewWarehouseReceipt!=='function')throw new Error('Receiving workspace export is missing.');
    await os.openNewWarehouseReceipt();
    canonical?.enhanceNewReceivingV16?.();
    document.body.classList.remove('wr-canonical-loading');
    main.style.visibility='visible';
  }catch(e){showLoadError(e)}finally{opening=false}
}

async function openExisting(id,mode='guided'){
  if(opening)return;
  opening=true;
  beginTransition();
  try{
    window.nodaraSetActive?.('wr');
    const {os,canonical}=await loadBundle();
    if(typeof os?.openWarehouseReceipt!=='function')throw new Error('WR workspace export is missing.');
    await os.openWarehouseReceipt(id);
    if(typeof canonical?.mountWarehouseReceiptV16!=='function')throw new Error('Canonical WR experience is missing.');
    await canonical.mountWarehouseReceiptV16(id,{mode});
  }catch(e){showLoadError(e)}finally{opening=false}
}

window.nodaraReceive=openEditor;
window.nodaraNewReceipt=openEditor;
window.nodaraOpenNewWR=openEditor;
window.nodaraOpenCanonicalWR=openExisting;

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-go="receive"],[data-new-wr],[data-action="new-wr"]');
  if(!btn)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openEditor();
},true);

let takeoverTimer=null;
const takeover=()=>{
  clearTimeout(takeoverTimer);
  takeoverTimer=setTimeout(()=>{
    const title=main?.querySelector('h1.title')?.textContent?.trim()||'';
    const text=main?.textContent||'';
    if(title==='What arrived?'&&text.includes('Find expected cargo')){
      openEditor();
      return;
    }
    mountCanonicalFromRenderedWR();
  },40);
};
new MutationObserver(takeover).observe(main,{childList:true,subtree:true});
setTimeout(takeover,250);
setTimeout(mountCanonicalFromRenderedWR,650);
