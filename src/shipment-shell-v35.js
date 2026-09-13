import { supabase } from './supabase-client.js';
import { mountCargoWorkspace } from './cargo-workspace.js?v=20260913-v35';

const main=document.getElementById('main');
const ROLES=[
 ['CUSTOMER','Customer',true],
 ['SHIPPER','Shipper',true],
 ['CONSIGNEE','Consignee',true],
 ['NOTIFY_PARTY','Notify Party',false],
 ['INTERMEDIATE_BROKER','Intermediate Broker',false],
 ['BILLING_PARTY','Bill To',false]
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
async function entities(){
 if(!entitiesPromise)entitiesPromise=supabase.from('entities').select('id,name,code').order('name').limit(1000).then(({data,error})=>{if(error)throw error;return data||[]});
 return entitiesPromise;
}
async function registry(id){
 const{data,error}=await supabase.from('transactions').select('id').eq('transaction_type','SHIPMENT').eq('domain_record_id',id).maybeSingle();
 if(error)throw error;return data?.id||null;
}
async function parties(txId){
 if(!txId)return[];
 const{data,error}=await supabase.from('transaction_parties').select('*').eq('transaction_id',txId).eq('is_primary',true).order('created_at');
 if(error)throw error;return data||[];
}
async function shipmentPartyProjection(id){
 const{data,error}=await supabase.from('shipments').select('customer_id,shipper_id,consignee_id').eq('id',id).single();
 if(error)throw error;return data||{};
}
function partyFor(rows,role){return rows.find(x=>String(x.role_code).toUpperCase()===role)||null}
function options(rows,current){return `<option value="">Not set</option>${rows.map(x=>`<option value="${x.id}" ${x.id===current?'selected':''}>${esc(x.name)}${x.code?` · ${esc(x.code)}`:''}</option>`).join('')}`}

async function renderParties(c){
 const [txId,ents,projection]=await Promise.all([registry(c.id),entities(),shipmentPartyProjection(c.id)]);
 if(!txId){c.panel.innerHTML='<div class="txw-empty">Shipment party registry is not ready yet.</div>';return}
 const ps=await parties(txId);
 c.panel.innerHTML=`<div class="sh35-parties">
  <div class="sh35-panel-head"><div><b>Shipment parties</b><small>Set the forwarding roles directly. No generic “add party” step.</small></div></div>
  <div class="sh35-party-grid">${ROLES.map(([role,label,required])=>{const p=partyFor(ps,role),coreField=CORE_ROLE_FIELDS[role],entityId=coreField?projection[coreField]:(p?.entity_id||'');return `<label class="sh35-party-slot"><span>${esc(label)}${required?' · Required':''}</span><select data-sh35-role="${role}" data-current-party="${p?.id||''}">${options(ents,entityId||'')}</select><small>${role==='BILLING_PARTY'&&!p?'Defaults operationally to Customer until set.':required?'Primary '+esc(label.toLowerCase())+' for this shipment.':'Optional'}</small></label>`}).join('')}</div>
  <div class="sh35-ref-note"><b>References</b><span>Customer reference, HAWB/MAWB and booking belong in the shipment file/Execution tab. They no longer need a second generic add form here.</span></div>
 </div>`;
 c.panel.querySelectorAll('[data-sh35-role]').forEach(sel=>sel.onchange=async()=>{
  const role=sel.dataset.sh35Role,currentParty=sel.dataset.currentParty,value=sel.value,coreField=CORE_ROLE_FIELDS[role];sel.disabled=true;
  try{
   if(!value){
    if(coreField){const{error}=await supabase.from('shipments').update({[coreField]:null,updated_at:new Date().toISOString()}).eq('id',c.id);if(error)throw error}
    if(currentParty){const{error}=await supabase.rpc('nodara_remove_transaction_party',{p_party_id:currentParty,p_provenance:{source_type:'USER',surface:'SHIPMENT_PARTIES'}});if(error)throw error}
   }else{
    const{error}=await supabase.rpc('nodara_add_transaction_party',{p_transaction_id:txId,p_role_code:role,p_entity_id:value,p_contact_id:null,p_address_id:null,p_is_primary:true,p_provenance:{source_type:'USER',surface:'SHIPMENT_PARTIES'},p_metadata:{}});if(error)throw error
   }
   window.nodaraTransactionWorkspace?.invalidate?.('SHIPMENT',c.id);
   await renderParties(c);
  }catch(e){alert(e.message||'Could not update shipment party');sel.disabled=false}
 });
}

async function renderCargo(c){
 c.panel.innerHTML=`<div class="sh35-panel-head"><div><b>Shipment cargo</b><small>Use warehouse cargo when it is in your custody, or create shipment-only cargo when it is elsewhere.</small></div></div><div data-sh35-cargo></div>`;
 const host=c.panel.querySelector('[data-sh35-cargo]');
 await mountCargoWorkspace(host,{transactionType:'SHIPMENT',transactionId:c.id,title:'Cargo',allowAdd:true});
 const load=host.querySelector('[data-load-cargo]'),fresh=host.querySelector('[data-new-cargo]');
 if(load){load.textContent='+ From WR / Existing';load.title='Assign cargo already known to NODARA'}
 if(fresh){fresh.textContent='+ New Shipment Cargo';fresh.title='Create cargo for this forwarding file even when it is not in your warehouse'}
}

function moveGuidance(){
 const c=context();if(!c)return;
 const g=main.querySelector('.tx-guidance');if(!g)return;
 const top=c.shell.querySelector('.txw-top');if(!top)return;
 if(g.parentElement!==c.shell||g.previousElementSibling!==top)top.insertAdjacentElement('afterend',g);
}
function removeLegacy(){
 if(!main?.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return;
 main.querySelector('#sh-edit')?.classList.add('sh35-retired');
 main.querySelector('#shipment-mode-record')?.classList.add('sh35-retired');
 main.querySelector('#shipment-document-studio')?.classList.add('sh35-retired');
 main.querySelectorAll('.shipment-guide').forEach(x=>x.remove());
 moveGuidance();
}
async function renderActive(force=false){
 const c=context();if(!c)return;removeLegacy();
 const key=`${c.id}:${c.tab}`;if(!force&&key===lastKey&&c.panel.dataset.sh35Owner===c.tab)return;
 if(!['parties','cargo'].includes(c.tab)){lastKey=key;delete c.panel.dataset.sh35Owner;return}
 if(busy)return;busy=true;
 try{
  c.panel.dataset.sh35Owner=c.tab;
  if(c.tab==='parties')await renderParties(c);else await renderCargo(c);
  lastKey=key;
 }catch(e){c.panel.innerHTML=`<div class="txw-empty">Unable to load ${esc(c.tab)}: ${esc(e.message||e)}</div>`}finally{busy=false}
}

function guidedTab(code){return({PLAN:'parties',BOOK:'execution',EXECUTE:'execution',TRACK:'execution',CLOSE:'documents'})[String(code||'').toUpperCase()]||'overview'}
function activate(tab){const b=context()?.shell.querySelector(`[data-txw-tab="${tab}"]`);b?.click()}
document.addEventListener('click',e=>{
 const c=context();if(!c)return;
 const guide=e.target.closest?.('.tx-guidance [data-tx-step],.tx-guidance [data-tx-continue]');
 if(guide){
  const step=guide.dataset.txStep||c.shell.querySelector('.tx-guidance .tx-step.current')?.dataset.txStep;
  if(step){e.preventDefault();e.stopImmediatePropagation();activate(guidedTab(step));return}
 }
 const tab=e.target.closest?.('[data-txw-tab]');
 if(tab)setTimeout(()=>renderActive(true),0);
},true);

const observer=new MutationObserver(records=>{
 let relevant=false;
 for(const r of records){for(const n of r.addedNodes){if(n.nodeType!==1)continue;if(n.matches?.('.tx-guidance,[data-txw-shell]')||n.querySelector?.('.tx-guidance,[data-txw-shell]')){relevant=true;break}}if(relevant)break}
 if(relevant)setTimeout(()=>{removeLegacy();renderActive(false)},0);
});
observer.observe(main,{childList:true,subtree:true});
setTimeout(()=>{removeLegacy();renderActive(true)},120);

const style=document.createElement('style');style.textContent=`
.sh35-retired{display:none!important}.sh35-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}.sh35-panel-head b,.sh35-panel-head small{display:block}.sh35-panel-head b{font-size:14px}.sh35-panel-head small{margin-top:3px;color:var(--muted,#8c95a7);font-size:11px}.sh35-party-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sh35-party-slot{display:grid;gap:6px;padding:12px;border:1px solid var(--border,rgba(255,255,255,.09));border-radius:14px;background:rgba(255,255,255,.015);min-width:0}.sh35-party-slot>span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted,#8c95a7)}.sh35-party-slot select{width:100%;min-width:0;box-sizing:border-box;padding:11px;border:1px solid var(--border,rgba(255,255,255,.09));border-radius:11px;background:var(--panel,#0d1118);color:inherit;font:inherit}.sh35-party-slot small{color:var(--muted,#8c95a7);font-size:10px}.sh35-ref-note{display:grid;gap:4px;margin-top:12px;padding:11px 12px;border-top:1px solid var(--border,rgba(255,255,255,.08));color:var(--muted,#8c95a7);font-size:11px}.sh35-ref-note b{color:var(--text,#fff)}.txw-shell>.tx-guidance{margin:12px 0!important}.txw-shell .txw-panel{min-width:0;max-width:100%;overflow:hidden}.txw-shell .cargo-ws,.txw-shell .cargo-ws-table{min-width:0;max-width:100%}@media(max-width:760px){.sh35-party-grid{grid-template-columns:1fr}.sh35-party-slot{padding:10px}.txw-shell>.tx-guidance{margin:10px 0!important}.txw-shell .cargo-ws-actions{display:grid!important;grid-template-columns:1fr!important;width:100%}.txw-shell .cargo-ws-actions button{width:100%!important}}
`;document.head.appendChild(style);
