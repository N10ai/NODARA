import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';
import { mountRecordResolver } from './nodara-record-resolver.js?v=20260913-v42';
import { mountCargoWorkspace } from './cargo-workspace.js?v=20260913-v41';
import { loadTransactionReadModel, transactionCargoSummary, primaryParty } from './transaction-read-model.js?v=20260907-workspace3';

const main=document.getElementById('main');
const ROLES=[['CUSTOMER','Customer',true,'customer'],['SHIPPER','Shipper',true,'shipper'],['CONSIGNEE','Consignee',true,'consignee'],['NOTIFY_PARTY','Notify Party',false,'consignee'],['INTERMEDIATE_BROKER','Intermediate Broker',false,'broker'],['BILLING_PARTY','Bill To',false,'billing_party']];
const CORE={CUSTOMER:'customer_id',SHIPPER:'shipper_id',CONSIGNEE:'consignee_id'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString(undefined,{maximumFractionDigits:d});
let activeId=null,activeNumber=null,partyCtrls=[],installing=false;

function legacyDescriptor(){
 const eye=main?.querySelector(':scope > .record-header .eyebrow')?.textContent?.trim()||'';
 const number=main?.querySelector(':scope > .record-header .title')?.textContent?.trim()||'';
 if(!number||!/^Operations · (AIR|OCEAN|GROUND)$/i.test(eye))return null;
 return{number,mode:eye.split('·').pop().trim().toUpperCase()};
}
function destroyPartyCtrls(){partyCtrls.forEach(x=>x?.destroy?.());partyCtrls=[]}
function clearNative(){
 if(main?.dataset.shipmentNative!=='1')return;
 destroyPartyCtrls();activeId=null;activeNumber=null;
 main.classList.remove('txw-active');delete main.dataset.txwType;delete main.dataset.txwTab;delete main.dataset.shipmentNative;
 if(main.dataset.wrNativeCanonical==='shipment')delete main.dataset.wrNativeCanonical;
}
async function shipmentByNumber(number){const{data,error}=await supabase.from('shipments').select('*').eq('shipment_number',number).maybeSingle();if(error)throw error;return data}
async function modelFor(id){try{return await loadTransactionReadModel('SHIPMENT',id)}catch{return null}}
function partyName(p){return p?.party_name_snapshot||p?.entity?.name||p?.contact_snapshot?.name||'—'}
function primaryRef(model){const rs=model?.references||[];return rs.find(x=>x.is_primary)||rs[0]||null}
function shellHTML(s,model){
 const t=transactionCargoSummary(model||{}),cust=primaryParty(model||{},'CUSTOMER'),ref=primaryRef(model),dir=String(s.direction||'').replaceAll('_',' ');
 return `<section class="txw-shell sh42-shell" data-txw-shell="SHIPMENT:${s.id}">
  <div class="txw-top"><div><div class="txw-kicker">${esc(s.mode||'')} SHIPMENT</div><h1 class="txw-title">${esc(s.shipment_number)}</h1><div class="txw-sub">${esc(partyName(cust)||'')}${ref?` · ${esc(ref.reference_value||'')}`:''}</div>${dir?`<span class="sh42-direction">${esc(dir)}</span>`:''}</div><span class="txw-status">${esc(s.status||'DRAFT')}</span></div>
  <div class="sh42-guide"><div><b>Shipment execution</b><small>Plan → Book → Execute → Track → Close</small></div><div class="sh42-guide-steps"><button data-guide="parties">1 Plan</button><button data-guide="execution">2 Book</button><button data-guide="execution">3 Execute</button><button data-guide="execution">4 Track</button><button data-guide="documents">5 Close</button></div></div>
  <div class="txw-metrics"><div class="txw-metric"><span>Cargo</span><b>${fmt(t.handlingQuantity,3)}</b></div><div class="txw-metric"><span>Gross weight</span><b>${fmt(t.grossWeightKg,3)} KG</b></div><div class="txw-metric"><span>Volume</span><b>${fmt(t.volumeCbm,4)} CBM</b></div><div class="txw-metric"><span>Reference</span><b>${esc(ref?.reference_value||s.reference||'—')}</b></div></div>
  <div class="txw-tabs">${['overview','parties','cargo','execution','documents','charges','notes','activity'].map((x,i)=>`<button class="txw-tab ${i===0?'active':''}" data-txw-tab="${x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div>
  <div class="txw-panel" data-txw-panel></div>
 </section>`;
}
function setActiveTab(shell,tab){main.dataset.txwTab=tab;shell.querySelectorAll('[data-txw-tab]').forEach(b=>b.classList.toggle('active',b.dataset.txwTab===tab))}
function rows(items,mapper){return items?.length?`<div class="txw-list">${items.map(mapper).join('')}</div>`:'<div class="txw-empty">Nothing here yet.</div>'}
function row(a,b,c=''){return `<div class="txw-row"><div><b>${esc(a)}</b>${c?`<small>${esc(c)}</small>`:''}</div><div>${esc(b??'—')}</div></div>`}

async function renderOverview(shell,s,model){const panel=shell.querySelector('[data-txw-panel]'),cust=primaryParty(model||{},'CUSTOMER'),ship=primaryParty(model||{},'SHIPPER'),cons=primaryParty(model||{},'CONSIGNEE');panel.innerHTML=`<div class="txw-facts"><div><span>Customer</span><b>${esc(partyName(cust))}</b></div><div><span>Shipper</span><b>${esc(partyName(ship))}</b></div><div><span>Consignee</span><b>${esc(partyName(cons))}</b></div><div><span>Direction</span><b>${esc(String(s.direction||'—').replaceAll('_',' '))}</b></div></div>`}
async function transactionRow(id){const{data,error}=await supabase.from('transactions').select('id,organization_id').eq('transaction_type','SHIPMENT').eq('domain_record_id',id).maybeSingle();if(error)throw error;return data}
async function entityList(){const org=await getCurrentOrganizationId();const{data,error}=await supabase.from('entities').select('id,name,code,roles').eq('organization_id',org).order('name').limit(2000);if(error)throw error;return data||[]}
async function partyRows(txid){const{data,error}=await supabase.from('transaction_parties').select('*').eq('transaction_id',txid).eq('is_primary',true);if(error)throw error;return data||[]}
async function setEntity(s,tx,role,e){const{error}=await supabase.rpc('nodara_add_transaction_party',{p_transaction_id:tx.id,p_role_code:role,p_entity_id:e.id,p_contact_id:null,p_address_id:null,p_is_primary:true,p_provenance:{source_type:'USER',surface:'SHIPMENT_NATIVE_V42'},p_metadata:{}});if(error)throw error;const f=CORE[role];if(f){const{error:ue}=await supabase.from('shipments').update({[f]:e.id,updated_at:new Date().toISOString()}).eq('id',s.id);if(ue)throw ue}}
async function setTyped(s,tx,role,name){const v=String(name||'').trim();if(!v)return;await supabase.from('transaction_parties').update({is_primary:false,updated_at:new Date().toISOString()}).eq('transaction_id',tx.id).eq('role_code',role).eq('is_primary',true);const{error}=await supabase.from('transaction_parties').insert({organization_id:tx.organization_id,transaction_id:tx.id,role_code:role,party_name_snapshot:v,is_primary:true,source:'USER',provenance:{source_type:'USER',surface:'SHIPMENT_NATIVE_V42'},metadata:{transaction_only:true}});if(error)throw error;const f=CORE[role];if(f)await supabase.from('shipments').update({[f]:null,updated_at:new Date().toISOString()}).eq('id',s.id)}
async function clearParty(s,tx,role,p){const f=CORE[role];if(f)await supabase.from('shipments').update({[f]:null,updated_at:new Date().toISOString()}).eq('id',s.id);if(p?.id)await supabase.rpc('nodara_remove_transaction_party',{p_party_id:p.id,p_provenance:{source_type:'USER',surface:'SHIPMENT_NATIVE_V42'}})}
async function createEntity(roleHint,name){const org=await getCurrentOrganizationId();const{data,error}=await supabase.from('entities').insert({organization_id:org,name:String(name||'').trim(),roles:[roleHint]}).select('id,name,code,roles').single();if(error)throw error;return data}
async function renderParties(shell,s){
 destroyPartyCtrls();const panel=shell.querySelector('[data-txw-panel]');panel.innerHTML='<div class="txw-empty">Loading parties…</div>';
 const[tx,ents,ps]=await Promise.all([transactionRow(s.id),entityList(),transactionRow(s.id).then(t=>t?partyRows(t.id):[])]);if(!tx){panel.innerHTML='<div class="txw-empty">Shipment transaction registry is not ready yet.</div>';return}
 panel.innerHTML=`<section class="sh42-parties"><div class="sh42-section-head"><div><b>Shipment parties</b><small>Type normally. Select a saved record, use the typed value only here, or create a reusable record.</small></div></div><div class="sh42-party-grid">${ROLES.map(r=>`<div data-sh42-role="${r[0]}"></div>`).join('')}</div></section>`;
 for(const[role,label,required,roleHint]of ROLES){const p=ps.find(x=>String(x.role_code).toUpperCase()===role),id=CORE[role]?s[CORE[role]]:p?.entity_id,current=ents.find(x=>x.id===id);let local=[...ents];const host=panel.querySelector(`[data-sh42-role="${role}"]`);const ctrl=mountRecordResolver(host,{label,required,value:current?.name||p?.party_name_snapshot||'',status:current?'Saved entity':p?.party_name_snapshot?'Transaction only':'',placeholder:`Search or type ${label.toLowerCase()}…`,search:q=>{const n=String(q||'').toLowerCase();return local.filter(x=>!n||[x.name,x.code,...(x.roles||[])].filter(Boolean).some(v=>String(v).toLowerCase().includes(n)))},formatResult:e=>({title:e.name,subtitle:[e.code,(e.roles||[]).join(', ')].filter(Boolean).join(' · ')||'Saved entity'}),typedLabel:'Use “{value}” only on this shipment',createLabel:'Create “{value}” as a reusable record',onSelect:async e=>{await setEntity(s,tx,role,e);ctrl.setValue(e.name,'Saved entity')},onUseTyped:async v=>{await setTyped(s,tx,role,v);ctrl.setValue(v,'Transaction only')},onCreate:async v=>{const e=await createEntity(roleHint,v);local.push(e);await setEntity(s,tx,role,e);ctrl.setValue(e.name,'Saved entity');return e},onClear:async()=>{await clearParty(s,tx,role,p);ctrl.setValue('','')}});partyCtrls.push(ctrl)}
}
async function renderCargo(shell,s){destroyPartyCtrls();const panel=shell.querySelector('[data-txw-panel]');panel.innerHTML='<div class="txw-empty">Loading shipment cargo…</div>';await mountCargoWorkspace(panel,{transactionType:'SHIPMENT',transactionId:s.id,title:'Shipment Cargo',allowAdd:true})}
async function renderSimple(shell,tab,s,model){destroyPartyCtrls();const panel=shell.querySelector('[data-txw-panel]');if(tab==='execution'){panel.innerHTML='<div class="txw-empty">Loading execution…</div>';return}if(tab==='documents'){const xs=model?.documents?.items||[];panel.innerHTML=rows(xs,x=>row(x.display_name||x.file_name||x.document_type||'Document',x.status||x.document_type||'','Document'));return}if(tab==='charges'){panel.innerHTML=rows(model?.charges||[],x=>row(x.description||x.service_code||'Charge',`${Number(x.sell_amount||0).toLocaleString()} ${x.currency||'USD'}`,x.status||''));return}if(tab==='notes'){panel.innerHTML=rows(model?.notes||[],x=>row(x.note_type||'Note',x.body||'',x.visibility||''));return}if(tab==='activity'){panel.innerHTML=rows((model?.activity||[]).slice(0,50),x=>row(x.summary||x.event_type||'Activity',x.occurred_at?new Date(x.occurred_at).toLocaleString():'',x.domain||''));return}await renderOverview(shell,s,model)}
async function showTab(shell,tab,s,model){setActiveTab(shell,tab);if(tab==='parties')return renderParties(shell,s);if(tab==='cargo')return renderCargo(shell,s);return renderSimple(shell,tab,s,model)}

async function install(){
 if(installing||!main)return;const d=legacyDescriptor();if(!d){clearNative();return}if(activeNumber===d.number&&main.querySelector('.sh42-shell'))return;installing=true;
 try{const s=await shipmentByNumber(d.number);if(!s)return;const model=await modelFor(s.id);destroyPartyCtrls();main.dataset.wrNativeCanonical='shipment';main.dataset.shipmentNative='1';main.classList.add('txw-active');main.dataset.txwType='SHIPMENT';main.dataset.txwTab='overview';main.querySelectorAll('[data-txw-shell]').forEach(x=>x.remove());main.querySelector(':scope > .record-header')?.classList.add('sh31-legacy-hidden');[...main.querySelectorAll(':scope > .record-section')].forEach(x=>x.classList.add('sh31-legacy-hidden'));main.querySelector('#shipment-mode-record')?.classList.add('sh31-legacy-hidden');const anchor=main.querySelector('.record-commandbar,.context-bar')||main.firstElementChild;const wrap=document.createElement('div');wrap.innerHTML=shellHTML(s,model);const shell=wrap.firstElementChild;if(anchor)anchor.insertAdjacentElement('afterend',shell);else main.prepend(shell);activeId=s.id;activeNumber=s.shipment_number;shell.querySelectorAll('[data-txw-tab]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();showTab(shell,b.dataset.txwTab,s,model)}));shell.querySelectorAll('[data-guide]').forEach(b=>b.addEventListener('click',()=>showTab(shell,b.dataset.guide,s,model)));await renderOverview(shell,s,model)}catch(e){console.error('[NODARA] shipment native',e)}finally{installing=false}
}

if(!document.getElementById('shipment-native-v42-style')){const st=document.createElement('style');st.id='shipment-native-v42-style';st.textContent=`.sh42-shell{width:100%;max-width:100%;box-sizing:border-box}.sh42-direction{display:inline-block;margin-top:8px;padding:5px 10px;border:1px solid rgba(91,157,255,.35);border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.08em}.sh42-guide{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}.sh42-guide>div:first-child{display:grid;gap:2px}.sh42-guide small,.sh42-section-head small{color:var(--muted,#8c95a7);font-size:10px}.sh42-guide-steps{display:flex;gap:6px;overflow:auto}.sh42-guide-steps button{white-space:nowrap}.sh42-section-head{margin-bottom:12px}.sh42-section-head>div{display:grid;gap:3px}.sh42-party-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sh42-party-grid>*{min-width:0}@media(max-width:760px){.sh42-guide{align-items:stretch;flex-direction:column}.sh42-guide-steps{width:100%}.sh42-party-grid{grid-template-columns:minmax(0,1fr)}}`;document.head.appendChild(st)}

let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(install,20)}).observe(main,{childList:true});queueMicrotask(install);
window.nodaraShipmentNativeV42={install};
