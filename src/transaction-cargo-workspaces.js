import { supabase } from './supabase-client.js';
import { mountCargoWorkspace } from './cargo-workspace.js';
import './transaction-cargo-table-polish.js';

const main=document.getElementById('main');
let busy=false,lastKey='',lastScreen='';

function screenSignature(){
  if(!main)return'';
  const eye=main.querySelector('.record-header .eyebrow')?.textContent?.trim()||'';
  const title=main.querySelector('.record-header .title')?.textContent?.trim()||'';
  if(eye&&title)return`${eye}|${title}`;
  return'';
}
function hideLegacyTotals(){
  for(const el of main.querySelectorAll('.detail-grid>div')){const s=el.querySelector('span');if(s?.textContent?.trim()==='Cargo')el.style.display='none'}
  for(const f of main.querySelectorAll('.field')){const l=f.querySelector('label')?.textContent?.trim();if(['Pieces','Weight','Weight unit','Volume CBM'].includes(l))f.style.display='none'}
}
function addCargoNote(kind){
  if(!main.querySelector('[id$="-save"]')||main.querySelector('.cargo-derived-note'))return;
  const n=document.createElement('div');n.className='notice compact cargo-derived-note';
  n.textContent=`Cargo can be created directly on this ${kind} or linked from warehouse cargo. A Warehouse Receipt is only required when cargo enters warehouse custody.`;
  main.querySelector('.record-section')?.prepend(n);
}
async function mountShipment(){
  const title=main.querySelector('.record-header .title')?.textContent?.trim(),eye=main.querySelector('.record-header .eyebrow')?.textContent?.trim()||'';
  if(!title||!/^Operations · (AIR|OCEAN|GROUND)$/i.test(eye))return false;
  const{data:r}=await supabase.from('shipments').select('id,shipment_number').eq('shipment_number',title).maybeSingle();if(!r)return false;
  const key=`SHIPMENT:${r.id}`;if(lastKey===key&&main.querySelector('[data-canonical-cargo]'))return true;
  const first=main.querySelector('.record-section');if(!first)return false;
  const sec=document.createElement('section');sec.className='record-section';sec.dataset.canonicalCargo='';sec.innerHTML='<div data-cargo-mount></div>';first.insertAdjacentElement('afterend',sec);
  await mountCargoWorkspace(sec.querySelector('[data-cargo-mount]'),{transactionType:'SHIPMENT',transactionId:r.id,title:'Shipment Cargo'});
  lastKey=key;hideLegacyTotals();addCargoNote('Shipment');return true;
}
async function mountTransport(){
  const title=main.querySelector('.record-header .title')?.textContent?.trim(),eye=main.querySelector('.record-header .eyebrow')?.textContent?.trim()||'';
  if(!title||!/^Operations · (PICKUP|DELIVERY|TRANSFER|DRAYAGE)$/i.test(eye))return false;
  const{data:r}=await supabase.from('transport_orders').select('id,order_number').eq('order_number',title).maybeSingle();if(!r)return false;
  const key=`TRANSPORT_ORDER:${r.id}`;if(lastKey===key&&main.querySelector('[data-canonical-cargo]'))return true;
  const first=main.querySelector('.record-section');if(!first)return false;
  const sec=document.createElement('section');sec.className='record-section';sec.dataset.canonicalCargo='';sec.innerHTML='<div data-cargo-mount></div>';first.insertAdjacentElement('afterend',sec);
  await mountCargoWorkspace(sec.querySelector('[data-cargo-mount]'),{transactionType:'TRANSPORT_ORDER',transactionId:r.id,title:'Transport Cargo'});
  lastKey=key;hideLegacyTotals();addCargoNote('Transport Order');return true;
}
async function tick(force=false){
  if(busy||!main)return;
  const sig=screenSignature();
  if(!force&&sig===lastScreen&&main.querySelector('[data-canonical-cargo]'))return;
  lastScreen=sig;busy=true;
  try{hideLegacyTotals();if(!sig){lastKey='';return}if(main.querySelector('[data-canonical-cargo]'))return;await mountShipment()||await mountTransport()}catch(e){if(!/does not exist|schema cache/i.test(e?.message||''))console.warn('Transaction cargo workspace',e)}finally{busy=false}
}

new MutationObserver(()=>setTimeout(()=>tick(),100)).observe(main,{childList:true});
setTimeout(()=>tick(true),800);

setTimeout(()=>{
  if(!document.querySelector('link[data-txw-css]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./transaction-workspace.css?v=20260907-workspace4';l.dataset.txwCss='1';document.head.appendChild(l)}
  import('./transaction-workspace-shell.js?v=20260907-workspace4').catch(e=>console.warn('[NODARA] optional transaction workspace did not load',e));
},1200);
