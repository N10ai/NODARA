const main=document.getElementById('main');
let opening=false;
let osPromise=null;

function showLoadError(err){
  console.error('NODARA Receiving OS failed to load',err);
  if(!main)return;
  main.innerHTML=`<div style="max-width:760px;margin:30px auto;padding:20px"><div class="eyebrow">WAREHOUSE RECEIVING</div><h1 class="title">Receiving OS could not start</h1><div class="notice warning" style="margin-top:16px">${String(err?.message||err||'Unknown module error').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}</div><button class="primary wide" style="margin-top:16px" onclick="location.reload()">Reload NODARA</button></div>`;
}

async function loadReceivingOS(){
  const moduleUrl=new URL('./wr-receiving-os-v10.js?v=20260909-v10e',import.meta.url);
  const response=await fetch(moduleUrl,{cache:'no-store'});
  if(!response.ok)throw new Error(`Receiving OS source failed to load (${response.status}).`);
  let source=await response.text();

  // v10 accidentally used "checkout" for both the checkout screen renderer and
  // the async checkout action. Safari correctly rejects that module at parse time.
  // Repair the renderer identifier before evaluating the module.
  source=source.replace('function checkout(){const v=S.visit||{},signed=S.checkoutSigned;','function checkoutPanel(){const v=S.visit||{},signed=S.checkoutSigned;');
  source=source.replace("if(S.step==='checkout')return checkout();if(S.step==='putaway')", "if(S.step==='checkout')return checkoutPanel();if(S.step==='putaway')");

  // Blob modules do not inherit the source file's relative import base, so make
  // its static imports absolute before evaluation.
  source=source.replace(/from\s+(['"])(\.\/[^'"]+)\1/g,(match,quote,path)=>`from ${quote}${new URL(path,moduleUrl).href}${quote}`);

  if(!source.includes('function checkoutPanel()'))throw new Error('Receiving OS checkout repair could not be applied.');
  const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{return await import(blobUrl)}finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),1000)}
}

async function loadOS(){
  if(!osPromise){
    osPromise=Promise.all([
      loadReceivingOS(),
      import('./wr-media-components-v9.js?v=20260909-v10e').catch(e=>{console.warn('WR media component unavailable',e);return null}),
      import('./wr-document-scanner-v9b.js?v=20260909-v10e').catch(e=>{console.warn('WR scanner unavailable',e);return null}),
      import('./wr-signature-component-v9.js?v=20260909-v10e').catch(e=>{console.warn('WR signature unavailable',e);return null}),
      import('./wr-os-guard-v10.js?v=20260909-v10e').catch(e=>{console.warn('WR guard unavailable',e);return null})
    ]).then(([os])=>os);
  }
  return osPromise;
}

async function openEditor(){
  if(opening)return;
  opening=true;
  try{
    window.nodaraSetActive?.('wr');
    const os=await loadOS();
    if(typeof os?.openNewWarehouseReceipt!=='function')throw new Error('Canonical receiving workspace export is missing.');
    await os.openNewWarehouseReceipt();
  }catch(e){showLoadError(e)}finally{opening=false}
}

async function openExisting(id){
  if(opening)return;
  opening=true;
  try{
    window.nodaraSetActive?.('wr');
    const os=await loadOS();
    if(typeof os?.openWarehouseReceipt!=='function')throw new Error('Canonical WR workspace export is missing.');
    await os.openWarehouseReceipt(id);
  }catch(e){showLoadError(e)}finally{opening=false}
}

window.nodaraReceive=openEditor;
window.nodaraNewReceipt=openEditor;
window.nodaraOpenNewWR=openEditor;
window.nodaraOpenCanonicalWR=openExisting;

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-go="receive"],[data-new-wr],[data-action="new-wr"]');
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  openEditor();
},true);

let takeoverTimer=null;
const takeover=()=>{
  clearTimeout(takeoverTimer);
  takeoverTimer=setTimeout(()=>{
    const title=main?.querySelector('h1.title')?.textContent?.trim()||'';
    const text=main?.textContent||'';
    if(title==='What arrived?'&&text.includes('Find expected cargo'))openEditor();
  },25);
};
new MutationObserver(takeover).observe(main,{childList:true,subtree:true});
setTimeout(takeover,250);
