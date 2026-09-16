import { supabase } from './supabase-client.js';
const main=document.getElementById('main');
let fixing=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function legacyShipmentNumber(){
 const h=[...main.querySelectorAll('h1,.title')].map(x=>x.textContent?.trim()||'').find(x=>/^Edit\s+(AIR|OCN|GRD)-/i.test(x));
 return h?h.replace(/^Edit\s+/i,''):'';
}
async function recoverLegacyEditor(){
 if(fixing||main.querySelector('.shipment-native-shell'))return;
 const number=legacyShipmentNumber();if(!number)return;
 fixing=true;
 try{
  const{data:s}=await supabase.from('shipments').select('shipment_number,mode').eq('shipment_number',number).maybeSingle();if(!s)return;
  main.innerHTML=`<div class="record-commandbar"><button class="secondary compact-btn" data-stable-back>‹ Shipments</button></div><div class="record-header"><div><div class="eyebrow">Operations · ${esc(s.mode)}</div><h1 class="title">${esc(s.shipment_number)}</h1></div></div>`;
  window.nodaraShipmentNative?.install?.();
 }finally{fixing=false}
}
function cargoEditor(shipmentId,onDone){
 const back=document.createElement('div');back.className='shipment-modalback';
 const box=document.createElement('div');box.className='shipment-modal shipment-direct-cargo';
 box.innerHTML=`<div class="shipment-modalhead"><div><div class="txw-kicker">SHIPMENT CARGO</div><h3>New cargo</h3><small>Create physical cargo directly on this shipment.</small></div><button data-x>×</button></div><div class="shipment-form-grid"><label><span>Quantity</span><input data-c="quantity" type="number" min="1" value="1"></label><label><span>Package type</span><select data-c="package_type"><option>PALLET</option><option selected>CARTON</option><option>BOX</option><option>CRATE</option><option>SKID</option><option>DRUM</option><option>BAG</option><option>PIECE</option></select></label><label class="span2"><span>Description</span><input data-c="description" placeholder="Cargo description"></label><label><span>Part number</span><input data-c="part_number"></label><label><span>SKU</span><input data-c="sku"></label><label><span>Gross weight</span><input data-c="gross_weight" type="number" step="any"></label><label><span>Weight unit</span><select data-c="weight_unit"><option>LB</option><option>KG</option></select></label><label><span>Weight means</span><select data-c="gross_weight_basis"><option value="LINE_TOTAL">Total</option><option value="PER_UNIT">Each</option></select></label><label><span>Dimension unit</span><select data-c="dimension_unit"><option>IN</option><option>CM</option><option>MM</option><option>M</option></select></label><label><span>Length</span><input data-c="length" type="number" step="any"></label><label><span>Width</span><input data-c="width" type="number" step="any"></label><label><span>Height</span><input data-c="height" type="number" step="any"></label><label><span>Dimensions mean</span><select data-c="dimension_basis"><option value="PER_UNIT">Each</option><option value="LINE_TOTAL">Total</option></select></label></div><div class="shipment-modalactions"><button class="secondary" data-cancel>Cancel</button><button class="primary" data-save>Create & add</button></div>`;
 document.body.append(back,box);const close=()=>{back.remove();box.remove()};back.onclick=close;box.querySelector('[data-x]').onclick=close;box.querySelector('[data-cancel]').onclick=close;
 box.querySelector('[data-save]').onclick=async e=>{const btn=e.currentTarget,p={children:[]};box.querySelectorAll('[data-c]').forEach(x=>p[x.dataset.c]=x.value);btn.disabled=true;btn.textContent='Creating…';try{if(!window.nodaraCargoWorkspace?.createDirect)throw new Error('Cargo service is not ready.');await window.nodaraCargoWorkspace.createDirect('SHIPMENT',shipmentId,p);close();await onDone?.()}catch(err){btn.disabled=false;btn.textContent='Create & add';alert(err.message||'Could not create cargo')}};
}
function enforceCargo(){
 const shell=main.querySelector('.shipment-native-shell');if(!shell||main.dataset.txwTab!=='cargo')return;
 const host=shell.querySelector('[data-shipment-cargo-host]'),ws=host?.querySelector('.cargo-ws');if(!ws)return;
 const actions=ws.querySelector('.cargo-ws-actions')||ws.querySelector('.cargo-ws-head')?.appendChild(document.createElement('div'));if(!actions)return;actions.classList.add('cargo-ws-actions');
 let load=ws.querySelector('[data-load-cargo]');if(load){load.style.display='';load.textContent='＋ Load existing'}
 let fresh=ws.querySelector('[data-new-cargo]');if(!fresh){fresh=document.createElement('button');fresh.type='button';fresh.className='secondary compact-btn';fresh.dataset.newCargo='';actions.appendChild(fresh)}fresh.style.display='';fresh.textContent='＋ New cargo';
 if(fresh.dataset.stableBound==='1')return;fresh.dataset.stableBound='1';fresh.onclick=e=>{e.preventDefault();e.stopPropagation();const id=(shell.dataset.txwShell||'').split(':')[1];if(id)cargoEditor(id,async()=>{await window.nodaraCargoWorkspace?.mount?.(host,{transactionType:'SHIPMENT',transactionId:id,title:'Shipment Cargo',allowAdd:true})})};
}
function purgeOld(){const shell=main.querySelector('.shipment-native-shell');if(!shell)return;main.querySelectorAll('#sh-edit,#sh-save,#sh-cancel,#shipment-mode-record,.tx-guidance,.shipment-guide,.sh42-guide').forEach(x=>x.remove());main.querySelectorAll(':scope > .record-header,:scope > .record-section').forEach(x=>x.remove());main.querySelectorAll('[data-txw-shell]').forEach(x=>{if(x!==shell&&!x.classList.contains('shipment-native-shell'))x.remove()})}
function reconcile(){recoverLegacyEditor();purgeOld();enforceCargo()}
if(main)new MutationObserver(()=>queueMicrotask(reconcile)).observe(main,{childList:true,subtree:true});document.addEventListener('click',e=>{if(e.target.closest?.('#sh-edit')&&main.querySelector('.shipment-native-shell')){e.preventDefault();e.stopImmediatePropagation()}},true);setInterval(reconcile,700);queueMicrotask(reconcile);
window.nodaraShipmentStabilityV50={reconcile};