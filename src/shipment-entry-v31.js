import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId, listEntities } from './live-data.js';
import { openShipments } from './operations-core.js?v=20260906-core4';
import './shipment-cargo-canonical-v32.js?v=20260913-v34';
import './shipment-air-execution-v33.js?v=20260913-v34';
import './shipment-stability-v34.js?v=20260913-v34';

if(!document.querySelector('link[data-shipment-entry-v32]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./shipment-entry-v31.css?v=20260913-v34';l.dataset.shipmentEntryV32='';document.head.appendChild(l)}

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]||c));
const gen=mode=>`${mode==='OCEAN'?'OCN':mode==='GROUND'?'GRD':'AIR'}-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${String(Date.now()).slice(-4)}`;
let installing=false;

async function renderCreate(){
 if(installing)return; installing=true;
 try{
  const entities=await listEntities('');
  const opts=(entities||[]).map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
  main.innerHTML=`<div class="sh31-create">
   <div class="record-commandbar"><button class="secondary compact-btn" id="sh31-cancel">‹ Shipments</button></div>
   <div class="sh31-create-card">
    <div class="eyebrow">New forwarding file</div><h1 class="title">New Shipment</h1>
    <p class="muted">Create the file with its identity. Routing, parties, cargo, booking and documents are completed inside the shipment.</p>
    <div class="sh31-mode" role="group" aria-label="Shipment mode">
     <button class="active" data-sh31-mode="AIR">Air</button><button data-sh31-mode="OCEAN">Ocean</button><button data-sh31-mode="GROUND">Ground</button>
    </div>
    <div class="sh31-direction-block">
     <span>Direction</span>
     <div class="sh31-direction" role="group" aria-label="Shipment direction">
      <button class="active" data-sh31-direction="EXPORT">Export</button>
      <button data-sh31-direction="IMPORT">Import</button>
      <button data-sh31-direction="CROSS_TRADE">Foreign → Foreign</button>
      <button data-sh31-direction="DOMESTIC">Domestic</button>
     </div>
    </div>
    <div class="sh31-fields">
     <label><span>Customer</span><select id="sh31-customer"><option value="">Choose customer…</option>${opts}</select></label>
     <label><span id="sh31-ref-label">AWB / customer reference</span><input id="sh31-ref" autocomplete="off" placeholder="Optional — can be added later"></label>
    </div>
    <div class="sh31-footer"><span class="muted">Customer + direction establish the forwarding file.</span><button class="primary" id="sh31-create">Create shipment →</button></div>
   </div></div>`;
  let mode='AIR',direction='EXPORT';
  main.querySelectorAll('[data-sh31-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.sh31Mode;main.querySelectorAll('[data-sh31-mode]').forEach(x=>x.classList.toggle('active',x===b));document.getElementById('sh31-ref-label').textContent=mode==='AIR'?'AWB / customer reference':mode==='OCEAN'?'BL / customer reference':'BOL / customer reference'});
  main.querySelectorAll('[data-sh31-direction]').forEach(b=>b.onclick=()=>{direction=b.dataset.sh31Direction;main.querySelectorAll('[data-sh31-direction]').forEach(x=>x.classList.toggle('active',x===b))});
  document.getElementById('sh31-cancel').onclick=()=>openShipments();
  document.getElementById('sh31-create').onclick=async e=>{
   const btn=e.currentTarget,customer=document.getElementById('sh31-customer').value,ref=document.getElementById('sh31-ref').value.trim();
   if(!customer)return alert('Choose the customer.');
   if(!direction)return alert('Choose the shipment direction.');
   btn.disabled=true;btn.textContent='Creating…';
   try{
    const org=await getCurrentOrganizationId(),number=gen(mode),payload={organization_id:org,shipment_number:number,mode,direction,status:'DRAFT',customer_id:customer,reference:ref||null,weight_unit:'KG',updated_at:new Date().toISOString()};
    if(mode==='AIR'&&/^\d{3}-?\d{8}$/.test(ref))payload.master_reference=ref;
    if(mode==='OCEAN'&&ref)payload.master_reference=ref;
    const{data,error}=await supabase.from('shipments').insert(payload).select().single();if(error)throw error;
    await openShipments(mode);
    setTimeout(()=>{const candidates=[...main.querySelectorAll('tr,[role="row"],button,a')];const hit=candidates.find(x=>x.textContent?.includes(data.shipment_number));hit?.click()},80);
   }catch(err){alert(err.message||'Could not create shipment');btn.disabled=false;btn.textContent='Create shipment →'}
  };
 }finally{installing=false}
}

function cleanRecord(){
 if(!main.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return;
 const shell=main.querySelector('[data-txw-shell]');if(!shell)return;
 const header=main.querySelector(':scope > .record-header');if(header)header.classList.add('sh31-legacy-hidden');
 const sections=[...main.querySelectorAll(':scope > .record-section')];
 sections.forEach(s=>{if(!s.dataset.canonicalCargo&&!s.querySelector('[data-cargo-mount]'))s.classList.add('sh31-legacy-hidden')});
 main.querySelector('#shipment-mode-record')?.classList.add('sh31-legacy-hidden');
 const edit=main.querySelector('#sh-edit');if(edit){edit.textContent='Edit shipment';edit.onclick=()=>{const parties=shell.querySelector('[data-txw-tab="parties"]');parties?.click()}}
}

function intercept(e){const b=e.target.closest?.('#ops-new-shipment');if(!b)return;e.preventDefault();e.stopImmediatePropagation();renderCreate()}
document.addEventListener('click',intercept,true);
// Route-level DOM changes are enough to detect shipment screens. Watching every
// nested render was repeatedly re-running cleanup during tab/form updates.
new MutationObserver(()=>queueMicrotask(cleanRecord)).observe(main,{childList:true});
queueMicrotask(cleanRecord);
window.nodaraNewShipment=renderCreate;
