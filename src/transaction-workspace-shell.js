import { supabase } from './supabase-client.js';
import { loadTransactionReadModel, transactionCargoSummary, primaryParty } from './transaction-read-model.js?v=20260907-workspace3';

const main=document.getElementById('main');
const ctxCache=new Map(),modelCache=new Map(),tabState=new Map();
let busy=false,lastScreen='',activeCtx=null,activeModel=null,entitiesPromise=null;
const PARTY_ROLES=['CUSTOMER','SHIPPER','CONSIGNEE','CARRIER','DRIVER','BILLING_PARTY','PICKUP_LOCATION','DELIVERY_LOCATION'];
const REF_TYPES=['CUSTOMER_REFERENCE','CUSTOMER_REF','PO','BOL','PRO','TRACKING','SO','ASN','ENTRY','BOOKING','MASTER_REFERENCE','HOUSE_REFERENCE','CARRIER_REFERENCE'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=v=>String(v||'').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const fmt=v=>v?new Date(v).toLocaleString():'—';
const n=(v,d=2)=>Number(v||0).toLocaleString(undefined,{maximumFractionDigits:d});
const partyName=p=>p?.party_name_snapshot||p?.contact_snapshot?.name||'—';
const refText=r=>r?.reference_value||'—';

function visibleDescriptor(){
  if(!main)return null;
  if(main.dataset.wrCore==='1'){
    const number=main.querySelector('.wr-modern-title .title')?.textContent?.trim();
    if(number&&number!=='New Warehouse Receipt')return{screen:`WR:${number}`,type:'WAREHOUSE_RECEIPT',table:'warehouse_receipts',numberField:'receipt_number',number,kind:'Warehouse Receipt'};
  }
  if(main.querySelector('#crc-back')&&main.querySelector('.record-number')){
    const number=main.querySelector('.record-number')?.textContent?.trim();
    if(number)return{screen:`CR:${number}`,type:'CARGO_RELEASE',table:'cargo_releases',numberField:'release_number',number,kind:'Cargo Release'};
  }
  const eye=main.querySelector('.record-header .eyebrow')?.textContent?.trim()||'',number=main.querySelector('.record-header .title')?.textContent?.trim();
  if(!number||!eye.startsWith('Operations ·'))return null;
  const subtype=eye.split('·').pop().trim().toUpperCase();
  if(['AIR','OCEAN','GROUND'].includes(subtype))return{screen:`SHIPMENT:${number}`,type:'SHIPMENT',table:'shipments',numberField:'shipment_number',number,kind:`${label(subtype)} Shipment`};
  if(['PICKUP','DELIVERY','TRANSFER','DRAYAGE'].includes(subtype))return{screen:`TRANSPORT:${number}`,type:'TRANSPORT_ORDER',table:'transport_orders',numberField:'order_number',number,kind:label(subtype)};
  return null;
}
async function resolveContext(d){
  if(ctxCache.has(d.screen))return ctxCache.get(d.screen);
  const select=d.type==='SHIPMENT'?'id,status,mode':d.type==='TRANSPORT_ORDER'?'id,status,order_type':'id,status';
  const{data,error}=await supabase.from(d.table).select(select).eq(d.numberField,d.number).maybeSingle();if(error)throw error;if(!data)return null;
  const ctx={...d,id:data.id,status:data.status,kind:d.type==='SHIPMENT'?`${label(data.mode)} Shipment`:d.type==='TRANSPORT_ORDER'?label(data.order_type):d.kind};ctxCache.set(d.screen,ctx);return ctx;
}
async function getModel(ctx,force=false){
  const key=`${ctx.type}:${ctx.id}`,hit=modelCache.get(key);if(!force&&hit&&Date.now()-hit.at<30000)return hit.model;
  const model=await loadTransactionReadModel(ctx.type,ctx.id);if(model)modelCache.set(key,{model,at:Date.now()});return model;
}
async function loadEntities(){
  if(!entitiesPromise)entitiesPromise=supabase.from('entities').select('id,name,code,roles').order('name').limit(500).then(({data,error})=>{if(error)throw error;return data||[]});
  return entitiesPromise;
}
function primaryReference(model){const rs=model?.references||[];return rs.find(x=>x.is_primary)||rs[0]||null}
function nextMilestone(model){const ms=model?.milestones||[],now=Date.now();return ms.find(x=>x.milestone_at&&new Date(x.milestone_at).getTime()>=now)||ms[0]||null}
function row(a,b,small=''){return `<div class="txw-row"><div><b>${esc(a)}</b>${small?`<small>${esc(small)}</small>`:''}</div><div>${esc(b??'—')}</div></div>`}
function empty(t){return `<div class="txw-empty">${esc(t)}</div>`}
function overview(model){
  const customer=primaryParty(model,'CUSTOMER'),ref=primaryReference(model),m=nextMilestone(model),docs=model?.documents?.items||[],charges=model?.charges||[],reqs=model?.requirements||[],rels=model?.relationships||[];
  return `<div class="txw-overview-primary"><div class="txw-summary-line"><span>Customer</span><b>${esc(partyName(customer))}</b></div><div class="txw-summary-line"><span>Reference</span><b>${esc(ref?`${label(ref.reference_type)} · ${refText(ref)}`:'—')}</b></div></div><div class="txw-facts"><div><span>Next milestone</span><b>${esc(m?(m.label||label(m.milestone_code)):'—')}</b><small>${esc(m?fmt(m.milestone_at||m.milestone_date):'')}</small></div><div><span>Documents</span><b>${docs.length}</b></div><div><span>Charges</span><b>${charges.length}</b></div><div><span>Requirements</span><b>${reqs.length||'None'}</b></div>${rels.length?`<div><span>Linked</span><b>${rels.length}</b></div>`:''}</div>`;
}
function partiesRead(model){const ps=model?.parties||[],rs=model?.references||[];return `<div class="txw-edit-grid"><section><div class="txw-section-title"><b>Parties</b><small>${ps.length}</small></div>${ps.length?`<div class="txw-list">${ps.map(p=>row(label(p.role_code),partyName(p),p.is_primary?'Primary':'')).join('')}</div>`:empty('No parties.')}</section><section><div class="txw-section-title"><b>References</b><small>${rs.length}</small></div>${rs.length?`<div class="txw-list">${rs.map(r=>row(label(r.reference_type),refText(r),r.is_primary?'Primary':'')).join('')}</div>`:empty('No references.')}</section></div>`}
function partiesEditor(model,entities){
  const ps=model?.parties||[],rs=model?.references||[];
  const entityOptions=entities.map(e=>`<option value="${e.id}">${esc(e.name)}${e.code?` · ${esc(e.code)}`:''}</option>`).join('');
  return `<div class="txw-edit-grid"><section class="txw-edit-section"><div class="txw-section-title"><b>Parties</b><small>${ps.length}</small></div>${ps.length?`<div class="txw-list">${ps.map(p=>`<div class="txw-row txw-edit-row"><div><b>${esc(label(p.role_code))}</b><small>${esc(partyName(p))}${p.is_primary?' · Primary':''}</small></div><button class="subtle" data-txw-remove-party="${p.id}">Remove</button></div>`).join('')}</div>`:empty('No parties.')}<div class="txw-inline-form"><select id="txw-party-role">${PARTY_ROLES.map(x=>`<option value="${x}">${esc(label(x))}</option>`).join('')}</select><select id="txw-party-entity"><option value="">Choose entity…</option>${entityOptions}</select><button class="primary" id="txw-add-party">Add</button></div></section><section class="txw-edit-section"><div class="txw-section-title"><b>References</b><small>${rs.length}</small></div>${rs.length?`<div class="txw-list">${rs.map(r=>`<div class="txw-row txw-edit-row"><div><b>${esc(label(r.reference_type))}</b><small>${esc(r.reference_value)}${r.is_primary?' · Primary':''}</small></div><button class="subtle" data-txw-remove-ref="${r.id}">Remove</button></div>`).join('')}</div>`:empty('No references.')}<div class="txw-inline-form txw-ref-form"><select id="txw-ref-type">${REF_TYPES.map(x=>`<option value="${x}">${esc(label(x))}</option>`).join('')}</select><input id="txw-ref-value" placeholder="Reference value"><label class="txw-check"><input type="checkbox" id="txw-ref-primary"> Primary</label><button class="primary" id="txw-add-ref">Add</button></div></section></div>`;
}
function cargo(model){const t=transactionCargoSummary(model),xs=model?.cargo||[];return `<div class="txw-facts txw-cargo-facts"><div><span>Handling qty</span><b>${n(t.handlingQuantity,3)}</b></div><div><span>Gross weight</span><b>${n(t.grossWeightKg,3)} KG</b></div><div><span>Volume</span><b>${n(t.volumeCbm,6)} CBM</b></div><div><span>Records</span><b>${xs.length}</b></div></div>${xs.length?`<div class="txw-list txw-cargo-list">${xs.slice(0,30).map(x=>{const c=x.cargo_object||{},q=x.allocated_quantity??c.quantity??0,u=x.uom||c.uom||c.package_type||'';return row(c.metadata?.part_number||c.metadata?.sku||c.description||c.cargo_code||c.package_type||'Cargo',`${n(q,3)} ${u}`,x.source==='CARGO_RELEASE_LINE'?'Release allocation':label(c.status||''))}).join('')}</div>`:empty('No cargo on this transaction.')}`}
function documents(model){const xs=model?.documents?.items||[];return xs.length?`<div class="txw-list">${xs.map(x=>row(x.display_name||x.file_name||x.document_type||'Document',label(x.document_type||x.category||''),x.status||'')).join('')}</div>`:empty('No documents.')}
function charges(model){const xs=model?.charges||[];return xs.length?`<div class="txw-list">${xs.map(x=>row(x.description||x.service_code||x.unit||'Charge',`${Number(x.sell_amount||0).toLocaleString()} ${x.currency||'USD'}`,label(x.status||x.billing_status||''))).join('')}</div>`:empty('No charges.')}
function notes(model){const xs=model?.notes||[];return `<div class="txw-note-compose"><textarea id="txw-note-body" rows="3" placeholder="Add an internal note…"></textarea><div class="txw-note-actions"><select id="txw-note-type"><option value="GENERAL">General</option><option value="OPERATIONAL">Operational</option><option value="CUSTOMER_SERVICE">Customer service</option><option value="BILLING">Billing</option></select><button class="primary" id="txw-add-note">Add note</button></div></div>${xs.length?`<div class="txw-list">${xs.map(x=>row(label(x.note_type||'Note'),x.body||'',label(x.visibility||''))).join('')}</div>`:empty('No notes yet.')}`}
function activity(model){const xs=model?.activity||[];return xs.length?`<div class="txw-list">${xs.slice(0,50).map(x=>row(x.summary||label(x.event_type||'Activity'),fmt(x.occurred_at),[label(x.domain||''),label(x.source_type||'')].filter(Boolean).join(' · '))).join('')}</div>`:empty('No activity recorded yet.')}
function execution(model,ctx){const m=nextMilestone(model),text=ctx.type==='WAREHOUSE_RECEIPT'?'Receiving, measurement, put-away and warehouse custody':ctx.type==='CARGO_RELEASE'?'Allocation, picking and physical release':ctx.type==='SHIPMENT'?'Routing, booking, carrier and forwarding execution':'Pickup, delivery, drayage and dispatch execution';return `<div class="txw-facts"><div><span>Status</span><b>${esc(ctx.status||'—')}</b></div><div><span>Next</span><b>${esc(m?(m.label||label(m.milestone_code)):'—')}</b></div><div><span>Workflow</span><b>${(model?.requirements||[]).some(x=>x.blocking)?'Action required':'Clear'}</b></div></div><div class="txw-empty">${esc(text)} uses the working controls below.</div>`}
function registryId(model){return model?.transaction?.id||model?.registry_transaction?.id||null}
async function refreshModel(ctx){modelCache.delete(`${ctx.type}:${ctx.id}`);const fresh=await getModel(ctx,true);activeModel=fresh;return fresh}
async function rerenderParties(shell,ctx){const fresh=await refreshModel(ctx),entities=await loadEntities();shell.querySelector('[data-txw-panel]').innerHTML=partiesEditor(fresh,entities);await bindPanel(shell,'parties',ctx,fresh)}
async function bindPanel(shell,tab,ctx,model){
  if(tab==='notes'){
    const btn=shell.querySelector('#txw-add-note'),body=shell.querySelector('#txw-note-body'),type=shell.querySelector('#txw-note-type');if(!btn||!body)return;
    btn.onclick=async()=>{const text=body.value.trim(),txId=registryId(model);if(!text||!txId)return;btn.disabled=true;btn.textContent='Saving…';try{const{error}=await supabase.rpc('nodara_add_transaction_note',{p_transaction_id:txId,p_body:text,p_note_type:type?.value||'GENERAL',p_visibility:'INTERNAL',p_pinned:false,p_provenance:{source_type:'USER',surface:'TRANSACTION_WORKSPACE'},p_metadata:{}});if(error)throw error;const fresh=await refreshModel(ctx);shell.querySelector('[data-txw-panel]').innerHTML=notes(fresh);await bindPanel(shell,'notes',ctx,fresh)}catch(e){alert(e.message||'Could not save note')}finally{btn.disabled=false;btn.textContent='Add note'}};return;
  }
  if(tab!=='parties')return;
  const txId=registryId(model);if(!txId)return;
  shell.querySelector('#txw-add-party')?.addEventListener('click',async e=>{const b=e.currentTarget,role=shell.querySelector('#txw-party-role')?.value,entity=shell.querySelector('#txw-party-entity')?.value;if(!entity)return alert('Choose an entity.');b.disabled=true;try{const{error}=await supabase.rpc('nodara_add_transaction_party',{p_transaction_id:txId,p_role_code:role,p_entity_id:entity,p_contact_id:null,p_address_id:null,p_is_primary:true,p_provenance:{source_type:'USER',surface:'TRANSACTION_WORKSPACE'},p_metadata:{}});if(error)throw error;await rerenderParties(shell,ctx)}catch(err){alert(err.message||'Could not add party')}finally{b.disabled=false}});
  shell.querySelectorAll('[data-txw-remove-party]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this party from the transaction?'))return;b.disabled=true;try{const{error}=await supabase.rpc('nodara_remove_transaction_party',{p_party_id:b.dataset.txwRemoveParty,p_provenance:{source_type:'USER',surface:'TRANSACTION_WORKSPACE'}});if(error)throw error;await rerenderParties(shell,ctx)}catch(err){alert(err.message||'Could not remove party')}});
  shell.querySelector('#txw-add-ref')?.addEventListener('click',async e=>{const b=e.currentTarget,type=shell.querySelector('#txw-ref-type')?.value,value=shell.querySelector('#txw-ref-value')?.value?.trim(),primary=!!shell.querySelector('#txw-ref-primary')?.checked;if(!value)return alert('Enter a reference value.');b.disabled=true;try{const{error}=await supabase.rpc('nodara_add_transaction_reference',{p_transaction_id:txId,p_reference_type:type,p_reference_value:value,p_issuer_entity_id:null,p_is_primary:primary,p_provenance:{source_type:'USER',surface:'TRANSACTION_WORKSPACE'},p_metadata:{}});if(error)throw error;await rerenderParties(shell,ctx)}catch(err){alert(err.message||'Could not add reference')}finally{b.disabled=false}});
  shell.querySelectorAll('[data-txw-remove-ref]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this reference?'))return;b.disabled=true;try{const{error}=await supabase.rpc('nodara_remove_transaction_reference',{p_reference_id:b.dataset.txwRemoveRef,p_provenance:{source_type:'USER',surface:'TRANSACTION_WORKSPACE'}});if(error)throw error;await rerenderParties(shell,ctx)}catch(err){alert(err.message||'Could not remove reference')}});
}
function legacyTarget(ctx,tab){if(ctx.type!=='WAREHOUSE_RECEIPT')return null;return({cargo:'cargo',documents:'documents',charges:'charges'})[tab]||null}
function syncLegacyWorkingArea(ctx,tab){
  main.dataset.txwTab=tab;
  const target=legacyTarget(ctx,tab);if(!target)return false;
  const b=main.querySelector(`[data-wrc2-tab="${target}"]`);if(b&&!b.classList.contains('active')){b.click();return true}return false;
}
async function renderTab(shell,tab,ctx,model){
  const panel=shell.querySelector('[data-txw-panel]');if(!panel)return;
  if(tab==='parties'){panel.innerHTML='<div class="txw-empty">Loading parties…</div>';try{panel.innerHTML=partiesEditor(model,await loadEntities());await bindPanel(shell,tab,ctx,model)}catch(e){panel.innerHTML=partiesRead(model)};return}
  panel.innerHTML=tab==='overview'?overview(model):tab==='cargo'?cargo(model):tab==='execution'?execution(model,ctx):tab==='documents'?documents(model):tab==='charges'?charges(model):tab==='notes'?notes(model):tab==='activity'?activity(model):overview(model);
  await bindPanel(shell,tab,ctx,model);
}
function renderShell(ctx,model){
  const t=transactionCargoSummary(model),customer=primaryParty(model,'CUSTOMER'),ref=primaryReference(model),m=nextMilestone(model),selected=tabState.get(ctx.screen)||'overview',shell=document.createElement('section');
  shell.className='txw-shell';shell.dataset.txwShell=`${ctx.type}:${ctx.id}`;
  shell.innerHTML=`<div class="txw-top"><div><div class="txw-kicker">${esc(ctx.kind)}</div><h1 class="txw-title">${esc(ctx.number)}</h1><div class="txw-sub">${esc(partyName(customer))}${ref?` · ${esc(label(ref.reference_type))} ${esc(refText(ref))}`:''}</div></div><span class="txw-status">${esc(ctx.status||model?.transaction?.status_projection||'')}</span></div><div class="txw-metrics"><div class="txw-metric"><span>Cargo</span><b>${n(t.handlingQuantity,3)}</b></div><div class="txw-metric"><span>Gross weight</span><b>${n(t.grossWeightKg,3)} KG</b></div><div class="txw-metric"><span>Volume</span><b>${n(t.volumeCbm,4)} CBM</b></div><div class="txw-metric"><span>Next</span><b>${esc(m?(m.label||label(m.milestone_code)):'—')}</b></div></div><div class="txw-tabs">${['overview','parties','cargo','execution','documents','charges','notes','activity'].map(x=>`<button class="txw-tab ${selected===x?'active':''}" data-txw-tab="${x}">${label(x)}</button>`).join('')}</div><div class="txw-panel" data-txw-panel></div>`;
  shell.querySelectorAll('[data-txw-tab]').forEach(b=>b.onclick=async()=>{const tab=b.dataset.txwTab;tabState.set(ctx.screen,tab);main.dataset.txwTab=tab;if(syncLegacyWorkingArea(ctx,tab))return;shell.querySelectorAll('[data-txw-tab]').forEach(x=>x.classList.toggle('active',x===b));await renderTab(shell,tab,ctx,activeModel||model)});
  setTimeout(()=>renderTab(shell,selected,ctx,model),0);return shell;
}
function activatePrimarySurface(ctx){main.classList.add('txw-active');main.dataset.txwType=ctx.type;main.dataset.txwTab=tabState.get(ctx.screen)||'overview'}
function deactivate(){main.classList.remove('txw-active');delete main.dataset.txwType;delete main.dataset.txwTab;main.querySelector('.txw-shell')?.remove();lastScreen='';activeCtx=null;activeModel=null}
async function enhance(force=false){
  if(busy||!main)return;const d=visibleDescriptor();if(!d){deactivate();return}if(!force&&d.screen===lastScreen&&main.querySelector('.txw-shell'))return;
  busy=true;try{const ctx=await resolveContext(d);if(!ctx)return;const model=await getModel(ctx,force);if(!model)return;main.querySelector('.txw-shell')?.remove();const shell=renderShell(ctx,model),anchor=main.querySelector('.record-commandbar,.context-bar,[data-wr-core] > .record-commandbar')||main.firstElementChild;if(anchor)anchor.insertAdjacentElement('afterend',shell);else main.prepend(shell);activeCtx=ctx;activeModel=model;activatePrimarySurface(ctx);lastScreen=d.screen;const selected=tabState.get(ctx.screen)||'overview';syncLegacyWorkingArea(ctx,selected)}catch(error){console.warn('[NODARA] transaction workspace enhancement unavailable',error)}finally{busy=false}}
let timer;function schedule(){clearTimeout(timer);timer=setTimeout(()=>enhance(false),120)}
if(main){new MutationObserver(schedule).observe(main,{childList:true});setTimeout(()=>enhance(false),650)}
window.nodaraTransactionWorkspace={refresh:()=>enhance(true),invalidate:(type,id)=>modelCache.delete(`${type}:${id}`)};
