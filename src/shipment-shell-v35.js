import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';
import { mountCargoWorkspace } from './cargo-workspace.js?v=20260913-v36';

const main=document.getElementById('main');
const ROLES=[
 ['CUSTOMER','Customer',true,'customer'],
 ['SHIPPER','Shipper',true,'shipper'],
 ['CONSIGNEE','Consignee',true,'consignee'],
 ['NOTIFY_PARTY','Notify Party',false,'consignee'],
 ['INTERMEDIATE_BROKER','Intermediate Broker',false,'broker'],
 ['BILLING_PARTY','Bill To',false,'billing_party']
];
const CORE_ROLE_FIELDS={CUSTOMER:'customer_id',SHIPPER:'shipper_id',CONSIGNEE:'consignee_id'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let entitiesPromise=null,busy=false,lastKey='';

function context(){
 if(!main?.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return null;
 const shell=main.querySelector('[data-txw-shell^="SHIPMENT:"]');
 if(!shell)return null;
 const id=String(shell.dataset.txwShell||'').split(':')[1];
 const panel=shell.querySelector('[data-txw-panel]');
 return id&&panel?{shell,id,panel,tab:main.dataset.txwTab||'overview'}:null;
}
async function entities(force=false){
 if(force)entitiesPromise=null;
 if(!entitiesPromise)entitiesPromise=supabase.from('entities').select('id,name,code,roles').order('name').limit(1000).then(({data,error})=>{if(error)throw error;return data||[]});
 return entitiesPromise;
}
async function registry(id){const{data,error}=await supabase.from('transactions').select('id,organization_id').eq('transaction_type','SHIPMENT').eq('domain_record_id',id).maybeSingle();if(error)throw error;return data||null}
async function parties(txId){if(!txId)return[];const{data,error}=await supabase.from('transaction_parties').select('*').eq('transaction_id',txId).eq('is_primary',true).order('created_at');if(error)throw error;return data||[]}
async function shipmentPartyProjection(id){const{data,error}=await supabase.from('shipments').select('customer_id,shipper_id,consignee_id').eq('id',id).single();if(error)throw error;return data||{}}
function partyFor(rows,role){return rows.find(x=>String(x.role_code).toUpperCase()===role)||null}
function entityName(list,id){return list.find(x=>x.id===id)?.name||''}

async function clearRole(c,tx,role,currentParty){
 const coreField=CORE_ROLE_FIELDS[role];
 if(coreField){const{error}=await supabase.from('shipments').update({[coreField]:null,updated_at:new Date().toISOString()}).eq('id',c.id);if(error)throw error}
 if(currentParty){const{error}=await supabase.rpc('nodara_remove_transaction_party',{p_party_id:currentParty,p_provenance:{source_type:'USER',surface:'SHIPMENT_PARTIES'}});if(error)throw error}
}
async function setSavedParty(c,tx,role,entityId){
 const{error}=await supabase.rpc('nodara_add_transaction_party',{p_transaction_id:tx.id,p_role_code:role,p_entity_id:entityId,p_contact_id:null,p_address_id:null,p_is_primary:true,p_provenance:{source_type:'USER',surface:'SHIPMENT_PARTIES'},p_metadata:{}});if(error)throw error
}
async function setTypedParty(c,tx,role,name){
 const clean=String(name||'').trim();if(!clean)return;
 await supabase.from('transaction_parties').update({is_primary:false,updated_at:new Date().toISOString()}).eq('transaction_id',tx.id).eq('role_code',role).eq('is_primary',true);
 const{error}=await supabase.from('transaction_parties').insert({organization_id:tx.organization_id,transaction_id:tx.id,role_code:role,entity_id:null,party_name_snapshot:clean,is_primary:true,source:'USER',provenance:{source_type:'USER',surface:'SHIPMENT_PARTIES',mode:'TYPED_TRANSACTION_ONLY'},metadata:{transaction_only:true}});if(error)throw error;
 const coreField=CORE_ROLE_FIELDS[role];if(coreField)await supabase.from('shipments').update({[coreField]:null,updated_at:new Date().toISOString()}).eq('id',c.id)
}
async function createMasterAndAssign(c,tx,role,roleHint,name){
 const org=await getCurrentOrganizationId();
 const roles=[roleHint||role.toLowerCase()];
 const{data,error}=await supabase.from('entities').insert({organization_id:org,name:String(name||'').trim(),roles}).select('id').single();if(error)throw error;
 await entities(true);await setSavedParty(c,tx,role,data.id)
}

function partySlotHTML(role,label,required,currentName,currentParty){return `<div class="sh36-party-slot" data-sh36-slot="${role}"><div class="sh36-party-label"><b>${esc(label)}</b>${required?'<span>Required</span>':'<span>Optional</span>'}</div><div class="sh36-party-search"><span>⌕</span><input autocomplete="off" data-sh36-input="${role}" value="${esc(currentName)}" placeholder="Search, create, or type a name…"><button type="button" data-sh36-clear="${role}" aria-label="Clear">×</button></div><div class="sh36-suggestions" data-sh36-suggestions="${role}" hidden></div><small>${currentParty?.entity_id?'Saved entity':currentParty?.party_name_snapshot?'Typed for this shipment only':'Search a saved record, create a new record, or use typed text only for this shipment.'}</small></div>`}

async function renderParties(c){
 const [tx,ents,projection]=await Promise.all([registry(c.id),entities(),shipmentPartyProjection(c.id)]);
 if(!tx){c.panel.innerHTML='<div class="txw-empty">Shipment party registry is not ready yet.</div>';return}
 const ps=await parties(tx.id);
 c.panel.innerHTML=`<div class="sh36-parties"><div class="sh35-panel-head"><div><b>Shipment parties</b><small>Fast entry: search a saved record, create a master record, or type a one-off party just for this shipment.</small></div></div><div class="sh36-party-grid">${ROLES.map(([role,label,required])=>{const p=partyFor(ps,role),core=CORE_ROLE_FIELDS[role],id=core?projection[core]:p?.entity_id,current=entityName(ents,id)||p?.party_name_snapshot||'';return partySlotHTML(role,label,required,current,p)}).join('')}</div></div>`;

 function bindSlot(role,label,required,roleHint){
  const input=c.panel.querySelector(`[data-sh36-input="${role}"]`),out=c.panel.querySelector(`[data-sh36-suggestions="${role}"]`),slot=input.closest('[data-sh36-slot]');let timer;
  const close=()=>{out.hidden=true;out.innerHTML=''};
  const paint=async()=>{const q=input.value.trim(),all=await entities(),needle=q.toLowerCase(),matches=all.filter(x=>!needle||[x.name,x.code,...(x.roles||[])].filter(Boolean).some(v=>String(v).toLowerCase().includes(needle))).slice(0,8);const rows=matches.map(x=>`<button type="button" data-sh36-entity="${x.id}"><b>${esc(x.name)}</b><small>${esc([x.code,(x.roles||[]).join(', ')].filter(Boolean).join(' · ')||'Saved entity')}</small></button>`);if(q){rows.push(`<button type="button" class="sh36-create" data-sh36-create><b>＋ Create “${esc(q)}”</b><small>Save as a reusable ${esc(label.toLowerCase())} record</small></button>`);rows.push(`<button type="button" class="sh36-use-typed" data-sh36-use><b>Use “${esc(q)}” only on this shipment</b><small>Do not create a master entity</small></button>`)}out.innerHTML=rows.join('')||'<div class="party-no-results">Type a name to continue.</div>';out.hidden=false;
   out.querySelectorAll('[data-sh36-entity]').forEach(b=>b.onclick=async()=>{input.disabled=true;try{await setSavedParty(c,tx,role,b.dataset.sh36Entity);await refresh()}catch(e){alert(e.message||'Could not set party');input.disabled=false}});
   out.querySelector('[data-sh36-create]')?.addEventListener('click',async()=>{input.disabled=true;try{await createMasterAndAssign(c,tx,role,roleHint,q);await refresh()}catch(e){alert(e.message||'Could not create party');input.disabled=false}});
   out.querySelector('[data-sh36-use]')?.addEventListener('click',async()=>{input.disabled=true;try{await setTypedParty(c,tx,role,q);await refresh()}catch(e){alert(e.message||'Could not set typed party');input.disabled=false}})
  };
  const refresh=async()=>{window.nodaraTransactionWorkspace?.invalidate?.('SHIPMENT',c.id);lastKey='';await renderParties(c)};
  input.onfocus=paint;input.oninput=()=>{clearTimeout(timer);timer=setTimeout(paint,120)};input.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='Enter'){e.preventDefault();const first=out.querySelector('[data-sh36-entity]');if(first)first.click();else if(input.value.trim())out.querySelector('[data-sh36-use]')?.click()}};
  c.panel.querySelector(`[data-sh36-clear="${role}"]`).onclick=async()=>{try{await clearRole(c,tx,role,partyFor(ps,role)?.id);await refresh()}catch(e){alert(e.message||'Could not clear party')}};
  document.addEventListener('pointerdown',e=>{if(!slot.contains(e.target))close()},{once:true})
 }
 ROLES.forEach(r=>bindSlot(...r));
}

function openShipmentCargoCreator(c){
 const shade=document.createElement('div');shade.className='cargo-picker-backdrop sh36-cargo-create';shade.innerHTML=`<div class="cargo-picker cargo-new"><div class="section-heading"><div><h3>New Shipment Cargo</h3><span>Create cargo directly on this shipment. No Warehouse Receipt is required.</span></div><button data-close>×</button></div><div class="detail-grid"><div class="field"><label>Package type</label><select data-cf="package_type"><option>PALLET</option><option selected>CARTON</option><option>BOX</option><option>CRATE</option><option>SKID</option><option>DRUM</option><option>BAG</option><option>PIECE</option></select></div><div class="field"><label>Quantity</label><input data-cf="quantity" type="number" min="1" value="1"></div><div class="field span2"><label>Description</label><input data-cf="description" placeholder="Commodity / description"></div><div class="field"><label>Part number</label><input data-cf="part_number"></div><div class="field"><label>SKU</label><input data-cf="sku"></div><div class="field"><label>Gross weight</label><input data-cf="gross_weight" type="number" step="any"></div><div class="field"><label>Weight unit</label><select data-cf="weight_unit"><option>LB</option><option>KG</option></select></div><div class="field"><label>L</label><input data-cf="length" type="number" step="any"></div><div class="field"><label>W</label><input data-cf="width" type="number" step="any"></div><div class="field"><label>H</label><input data-cf="height" type="number" step="any"></div><div class="field"><label>Dimension unit</label><select data-cf="dimension_unit"><option>IN</option><option>CM</option></select></div></div><div class="cargo-picker-actions"><button class="secondary" data-close-2>Cancel</button><button class="primary" data-create>Create & Add</button></div></div>`;document.body.appendChild(shade);const close=()=>shade.remove();shade.querySelector('[data-close]').onclick=close;shade.querySelector('[data-close-2]').onclick=close;shade.querySelector('[data-create]').onclick=async e=>{const btn=e.currentTarget,p={children:[],gross_weight_basis:'LINE_TOTAL',dimension_basis:'PER_UNIT'};shade.querySelectorAll('[data-cf]').forEach(x=>p[x.dataset.cf]=x.value);btn.disabled=true;btn.textContent='Creating…';try{const api=window.nodaraCargoWorkspace;if(!api?.createDirect)throw new Error('Cargo service is not ready.');await api.createDirect('SHIPMENT',c.id,p);close();lastKey='';await renderCargo(c)}catch(err){btn.disabled=false;btn.textContent='Create & Add';alert(err.message||'Could not create cargo')}}
}

async function renderCargo(c){
 c.panel.innerHTML=`<div class="sh35-panel-head"><div><b>Shipment cargo</b><small>Add cargo directly to the shipment, or link cargo already received/known in NODARA.</small></div><div class="sh36-cargo-actions"><button class="primary compact-btn" data-sh36-new-cargo>＋ New Shipment Cargo</button><button class="secondary compact-btn" data-sh36-existing>From WR / Existing</button></div></div><div data-sh36-cargo></div>`;
 c.panel.querySelector('[data-sh36-new-cargo]').onclick=()=>openShipmentCargoCreator(c);
 const host=c.panel.querySelector('[data-sh36-cargo]');await mountCargoWorkspace(host,{transactionType:'SHIPMENT',transactionId:c.id,title:'Cargo',allowAdd:false});
 c.panel.querySelector('[data-sh36-existing]').onclick=()=>window.nodaraCargoWorkspace?.picker?.('SHIPMENT',c.id,()=>renderCargo(c));
}

function moveGuidance(){const c=context();if(!c)return;const g=main.querySelector('.tx-guidance'),top=c.shell.querySelector('.txw-top');if(g&&top&&(g.parentElement!==c.shell||g.previousElementSibling!==top))top.insertAdjacentElement('afterend',g)}
function removeLegacy(){if(!main?.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return;main.querySelector('#sh-edit')?.classList.add('sh35-retired');main.querySelector('#shipment-mode-record')?.classList.add('sh35-retired');main.querySelector('#shipment-document-studio')?.classList.add('sh35-retired');main.querySelectorAll('.shipment-guide').forEach(x=>x.remove());moveGuidance()}
async function renderActive(force=false){const c=context();if(!c)return;removeLegacy();const key=`${c.id}:${c.tab}`;if(!force&&key===lastKey&&c.panel.dataset.sh35Owner===c.tab)return;if(!['parties','cargo'].includes(c.tab)){lastKey=key;delete c.panel.dataset.sh35Owner;return}if(busy)return;busy=true;try{c.panel.dataset.sh35Owner=c.tab;if(c.tab==='parties')await renderParties(c);else await renderCargo(c);lastKey=key}catch(e){c.panel.innerHTML=`<div class="txw-empty">Unable to load ${esc(c.tab)}: ${esc(e.message||e)}</div>`}finally{busy=false}}
function guidedTab(code){return({PLAN:'parties',BOOK:'execution',EXECUTE:'execution',TRACK:'execution',CLOSE:'documents'})[String(code||'').toUpperCase()]||'overview'}
function activate(tab){context()?.shell.querySelector(`[data-txw-tab="${tab}"]`)?.click()}
document.addEventListener('click',e=>{const c=context();if(!c)return;const guide=e.target.closest?.('.tx-guidance [data-tx-step],.tx-guidance [data-tx-continue]');if(guide){const step=guide.dataset.txStep||c.shell.querySelector('.tx-guidance .tx-step.current')?.dataset.txStep;if(step){e.preventDefault();e.stopImmediatePropagation();activate(guidedTab(step));return}}const tab=e.target.closest?.('[data-txw-tab]');if(tab)setTimeout(()=>renderActive(true),0)},true);
const observer=new MutationObserver(records=>{let relevant=false;for(const r of records){for(const n of r.addedNodes){if(n.nodeType!==1)continue;if(n.matches?.('.tx-guidance,[data-txw-shell]')||n.querySelector?.('.tx-guidance,[data-txw-shell]')){relevant=true;break}}if(relevant)break}if(relevant)setTimeout(()=>{removeLegacy();renderActive(false)},0)});observer.observe(main,{childList:true,subtree:true});setTimeout(()=>{removeLegacy();renderActive(true)},120);

const style=document.createElement('style');style.textContent=`
.sh35-retired{display:none!important}.sh35-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}.sh35-panel-head b,.sh35-panel-head small{display:block}.sh35-panel-head b{font-size:14px}.sh35-panel-head small{margin-top:3px;color:var(--muted,#8c95a7);font-size:11px}.sh36-party-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sh36-party-slot{position:relative;display:grid;gap:7px;padding:12px;border:1px solid var(--border,rgba(255,255,255,.09));border-radius:14px;background:rgba(255,255,255,.015);min-width:0}.sh36-party-label{display:flex;justify-content:space-between;gap:8px;align-items:center}.sh36-party-label b{font-size:11px;text-transform:uppercase;letter-spacing:.06em}.sh36-party-label span{font-size:9px;color:var(--muted,#8c95a7)}.sh36-party-search{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:7px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:11px;background:var(--panel,#0d1118);padding:0 9px}.sh36-party-search input{border:0!important;background:transparent!important;min-width:0;padding:12px 0!important;color:inherit!important;outline:0}.sh36-party-search button{border:0;background:transparent;color:var(--muted,#8c95a7);font-size:18px}.sh36-party-slot>small{font-size:10px;color:var(--muted,#8c95a7)}.sh36-suggestions{position:absolute;z-index:90;left:12px;right:12px;top:79px;max-height:320px;overflow:auto;border:1px solid #2b3b4e;border-radius:12px;background:#0b1119;box-shadow:0 18px 50px #000a;padding:6px}.sh36-suggestions button{width:100%;display:grid;text-align:left;gap:2px;padding:10px;border:0;border-radius:9px;background:transparent;color:inherit}.sh36-suggestions button:hover,.sh36-suggestions button:active{background:#142238}.sh36-suggestions small{color:var(--muted,#8c95a7)}.sh36-create{border-top:1px solid #263447!important}.sh36-use-typed{color:#b7c9df!important}.sh36-cargo-actions{display:flex;gap:8px;flex-wrap:wrap}.txw-shell>.tx-guidance{margin:12px 0!important}.txw-shell .txw-panel{min-width:0;max-width:100%;overflow:visible}.txw-shell .cargo-ws,.txw-shell .cargo-ws-table{min-width:0;max-width:100%}@media(max-width:760px){.sh36-party-grid{grid-template-columns:1fr}.sh36-party-slot{padding:10px}.sh36-suggestions{left:10px;right:10px}.sh35-panel-head{display:grid}.sh36-cargo-actions{display:grid;grid-template-columns:1fr;width:100%}.sh36-cargo-actions button{width:100%}.txw-shell>.tx-guidance{margin:10px 0!important}}
`;document.head.appendChild(style);
