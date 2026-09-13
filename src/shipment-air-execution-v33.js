import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const local=v=>{if(!v)return'';try{const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}catch{return''}};
let busy=false;

function ctx(){
 if(!main?.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return null;
 const shell=main.querySelector('[data-txw-shell^="SHIPMENT:"]');if(!shell)return null;
 const id=String(shell.dataset.txwShell||'').split(':')[1],panel=shell.querySelector('[data-txw-panel]');
 if(!id||!panel)return null;return{shell,id,panel};
}
async function load(id){
 const [{data:s,error},{data:link}]=await Promise.all([
  supabase.from('shipments').select('*').eq('id',id).single(),
  supabase.from('consolidation_houses').select('id,consolidation_id,consolidations(*)').eq('shipment_id',id).maybeSingle()
 ]);if(error)throw error;return{s,link:link||null};
}
function field(id,label,value='',ph='',type='text'){return `<label class="sh33-field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}"></label>`}
function select(id,label,value,items){return `<label class="sh33-field"><span>${label}</span><select id="${id}">${items.map(([v,l])=>`<option value="${esc(v)}" ${String(value||'')===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`}
function currentTab(c){return c.shell.querySelector('[data-txw-tab="execution"].active')||main.dataset.txwTab==='execution'}
function airRole(s,link){return link?'HOUSE':String(s.metadata?.mode_details?.air_role||'DIRECT').toUpperCase()}

function draw(c,s,link){
 const m=s.metadata||{},d=m.mode_details||{},role=airRole(s,link),con=link?.consolidations||null;
 c.panel.dataset.sh33AirFor=c.id;
 c.panel.innerHTML=`<div class="sh33-air">
  <div class="sh33-head"><div><div class="eyebrow">AIR EXECUTION</div><h3>Routing & carrier execution</h3><small>Operational facts for the air file. Cargo and parties stay in their own tabs.</small></div><button class="primary compact-btn" id="sh33-save">Save changes</button></div>
  <div class="sh33-rolebar">
   <div><span>Air file type</span><b>${role==='HOUSE'?'House shipment (HAWB)':role==='DIRECT'?'Direct / master shipment':'Master shipment'}</b></div>
   ${con?`<button class="secondary compact-btn" id="sh33-open-con">${esc(con.consolidation_number||'Open consolidation')} · ${esc(con.master_reference||'MAWB pending')}</button>`:`<button class="secondary compact-btn" id="sh33-link-con">+ Add to consolidation</button>`}
  </div>
  <section class="sh33-section"><div class="sh33-section-title"><b>Airway bill & booking</b><small>${role==='HOUSE'?'House identity + parent master':'Direct/master identity'}</small></div><div class="sh33-grid">
   ${field('sh33-house','HAWB',s.house_reference||'', 'House airway bill')}
   ${field('sh33-master','MAWB',con?.master_reference||s.master_reference||'', role==='HOUSE'?'Inherited from consolidation':'000-00000000')}
   ${field('sh33-booking','Booking / carrier reference',s.booking_reference||'', 'Booking confirmation')}
   ${select('sh33-role','File type',role,[['DIRECT','Direct / master'],['HOUSE','House shipment']])}
  </div></section>
  <section class="sh33-section"><div class="sh33-section-title"><b>Routing</b><small>Airport-to-airport movement</small></div><div class="sh33-grid">
   ${field('sh33-origin','Origin airport',s.origin_code||s.origin_name||'','MIA')}
   ${field('sh33-dest','Destination airport',s.destination_code||s.destination_name||'','UIO')}
   ${field('sh33-airline','Airline',d.airline||'','LATAM Cargo')}
   ${field('sh33-flight','Flight number',d.flight_number||'','LA 2465')}
   ${field('sh33-flightdate','Flight date',local(d.flight_date||s.etd),'','datetime-local')}
   ${select('sh33-service','Service',d.service_level||'', [['','Not set'],['GENERAL','General'],['PRIORITY','Priority'],['EXPRESS','Express'],['CHARTER','Charter']])}
  </div></section>
  <section class="sh33-section"><div class="sh33-section-title"><b>Timing</b><small>Plan and cutoff</small></div><div class="sh33-grid">
   ${field('sh33-cutoff','Cargo cutoff',local(d.cutoff_at),'','datetime-local')}
   ${field('sh33-etd','ETD',local(s.etd),'','datetime-local')}
   ${field('sh33-eta','ETA',local(s.eta),'','datetime-local')}
  </div></section>
  <section class="sh33-section"><div class="sh33-section-title"><b>Security & handling</b><small>Keep only what operations actually needs</small></div><div class="sh33-grid">
   ${select('sh33-security','Security / TSA status',d.security_status||'', [['','Not set'],['KNOWN_SHIPPER','Known shipper'],['UNKNOWN_SHIPPER','Unknown shipper'],['SCREENED','Screened'],['EXEMPT','Exempt / not applicable'],['PENDING','Pending']])}
   <label class="sh33-field sh33-span2"><span>Handling information</span><textarea id="sh33-handling" rows="3" placeholder="DG, temperature control, special handling, airline instructions…">${esc(d.handling_info||'')}</textarea></label>
  </div></section>
 </div>`;
 c.panel.querySelector('#sh33-master').disabled=!!con;
 c.panel.querySelector('#sh33-role').disabled=!!con;
 c.panel.querySelector('#sh33-save').onclick=()=>save(c,s,link);
 c.panel.querySelector('#sh33-open-con')?.addEventListener('click',()=>window.nodaraConsolidations?.open?.(con.id));
 c.panel.querySelector('#sh33-link-con')?.addEventListener('click',()=>pickConsolidation(c,s));
}

async function save(c,s,link){
 const btn=c.panel.querySelector('#sh33-save');btn.disabled=true;btn.textContent='Saving…';
 try{
  const old=s.metadata||{},oldD=old.mode_details||{},role=c.panel.querySelector('#sh33-role').value;
  const mode_details={...oldD,air_role:link?'HOUSE':role,airline:c.panel.querySelector('#sh33-airline').value.trim()||null,flight_number:c.panel.querySelector('#sh33-flight').value.trim()||null,flight_date:c.panel.querySelector('#sh33-flightdate').value||null,service_level:c.panel.querySelector('#sh33-service').value||null,cutoff_at:c.panel.querySelector('#sh33-cutoff').value||null,security_status:c.panel.querySelector('#sh33-security').value||null,handling_info:c.panel.querySelector('#sh33-handling').value.trim()||null};
  const p={house_reference:c.panel.querySelector('#sh33-house').value.trim()||null,booking_reference:c.panel.querySelector('#sh33-booking').value.trim()||null,origin_code:c.panel.querySelector('#sh33-origin').value.trim().toUpperCase()||null,destination_code:c.panel.querySelector('#sh33-dest').value.trim().toUpperCase()||null,etd:c.panel.querySelector('#sh33-etd').value||null,eta:c.panel.querySelector('#sh33-eta').value||null,metadata:{...old,mode_details},updated_at:new Date().toISOString()};
  if(!link)p.master_reference=c.panel.querySelector('#sh33-master').value.trim()||null;
  const{error}=await supabase.from('shipments').update(p).eq('id',c.id);if(error)throw error;
  window.nodaraTransactionWorkspace?.invalidate?.('SHIPMENT',c.id);
  const fresh=await load(c.id);draw(c,fresh.s,fresh.link);
 }catch(e){alert(e.message||'Could not save air execution')}finally{btn.disabled=false;btn.textContent='Save changes'}
}

async function pickConsolidation(c,s){
 const org=await getCurrentOrganizationId();
 const{data,error}=await supabase.from('consolidations').select('*').eq('organization_id',org).eq('mode','AIR').not('status','in','("CLOSED","CANCELLED")').order('created_at',{ascending:false});if(error)return alert(error.message);
 const shade=document.createElement('div');shade.className='cargo-picker-backdrop';shade.innerHTML=`<div class="cargo-picker"><div class="section-heading"><div><h3>Add to Air Consolidation</h3><span class="muted">The shipment becomes a house under the selected master.</span></div><button data-close>×</button></div><div class="sh33-con-list">${(data||[]).map(x=>`<button data-con="${x.id}"><b>${esc(x.consolidation_number)}</b><span>${esc(x.origin_code||'—')} → ${esc(x.destination_code||'—')}</span><small>${esc(x.master_reference||'MAWB pending')} · ${esc(x.status||'')}</small></button>`).join('')||'<div class="empty compact">No open Air consolidations.</div>'}</div></div>`;document.body.appendChild(shade);shade.querySelector('[data-close]').onclick=()=>shade.remove();shade.querySelectorAll('[data-con]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const{data:existing}=await supabase.from('consolidation_houses').select('id').eq('shipment_id',s.id).maybeSingle();if(existing)throw new Error('This shipment is already linked to a consolidation.');const{count}=await supabase.from('consolidation_houses').select('id',{count:'exact',head:true}).eq('consolidation_id',b.dataset.con);const{error:e}=await supabase.from('consolidation_houses').insert({organization_id:org,consolidation_id:b.dataset.con,shipment_id:s.id,sequence_no:Number(count||0)+1});if(e)throw e;const meta=s.metadata||{},md=meta.mode_details||{};await supabase.from('shipments').update({metadata:{...meta,mode_details:{...md,air_role:'HOUSE'}},updated_at:new Date().toISOString()}).eq('id',s.id);shade.remove();const fresh=await load(c.id);draw(c,fresh.s,fresh.link)}catch(e){alert(e.message||'Could not link consolidation');b.disabled=false}})}

async function mount(){
 if(busy)return;const c=ctx();if(!c||!currentTab(c))return;
 if(c.panel.dataset.sh33AirFor===c.id)return;
 busy=true;try{const{data}=await supabase.from('shipments').select('mode').eq('id',c.id).maybeSingle();if(data?.mode!=='AIR')return;const x=await load(c.id);draw(c,x.s,x.link)}catch(e){console.warn('[NODARA] air execution',e)}finally{busy=false}
}

const css=document.createElement('style');css.textContent=`.sh33-air,.sh33-air *{min-width:0}.sh33-air{display:grid;gap:10px;max-width:100%}.sh33-head,.sh33-rolebar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.sh33-head>div,.sh33-rolebar>div{min-width:0}.sh33-head h3{margin:2px 0;overflow-wrap:anywhere}.sh33-head small,.sh33-rolebar span,.sh33-section-title small{color:var(--muted,#8c95a7);font-size:10px}.sh33-rolebar{padding:10px 11px;border:1px solid rgba(105,169,255,.16);border-radius:13px;background:rgba(70,137,245,.04)}.sh33-rolebar span,.sh33-rolebar b{display:block}.sh33-rolebar b{font-size:12px;margin-top:2px;overflow-wrap:anywhere}.sh33-section{padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.015);overflow:hidden}.sh33-section-title{display:flex;justify-content:space-between;gap:10px;margin-bottom:9px;min-width:0}.sh33-section-title b{font-size:13px}.sh33-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;min-width:0}.sh33-field{display:grid;gap:5px;min-width:0}.sh33-field span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#8c95a7);font-weight:700}.sh33-field input,.sh33-field select,.sh33-field textarea{width:100%;min-width:0;max-width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:rgba(0,0,0,.13);color:inherit;padding:9px 10px;font:inherit}.sh33-field textarea{resize:vertical}.sh33-field input:disabled,.sh33-field select:disabled{opacity:.55}.sh33-span2{grid-column:span 2}.sh33-con-list{display:grid;gap:6px}.sh33-con-list button{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;text-align:left;padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:transparent;color:inherit;max-width:100%}.sh33-con-list button small{grid-column:1/-1;color:var(--muted,#8c95a7)}@media(max-width:760px){.sh33-head,.sh33-rolebar{align-items:stretch;flex-direction:column}.sh33-head button,.sh33-rolebar button{width:100%;max-width:100%;white-space:normal}.sh33-grid{grid-template-columns:1fr 1fr}.sh33-span2{grid-column:1/-1}.sh33-section{padding:10px}.sh33-section-title{align-items:flex-start;flex-direction:column;gap:2px}}@media(max-width:480px){.sh33-grid{grid-template-columns:minmax(0,1fr)}.sh33-span2{grid-column:auto}}`;document.head.appendChild(css);
document.addEventListener('click',e=>{if(e.target.closest?.('[data-txw-tab="execution"]'))setTimeout(mount,0)},true);
// Route changes insert/remove direct children of #main. Do not observe the entire
// subtree: form renders used to wake this observer repeatedly on Safari.
new MutationObserver(()=>queueMicrotask(mount)).observe(main,{childList:true});
queueMicrotask(mount);
