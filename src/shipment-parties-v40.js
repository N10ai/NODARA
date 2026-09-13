import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';
import { mountRecordResolver } from './nodara-record-resolver.js?v=20260913-v39';

const main=document.getElementById('main');
const ROLES=[['CUSTOMER','Customer',true,'customer'],['SHIPPER','Shipper',true,'shipper'],['CONSIGNEE','Consignee',true,'consignee'],['NOTIFY_PARTY','Notify Party',false,'consignee'],['INTERMEDIATE_BROKER','Intermediate Broker',false,'broker'],['BILLING_PARTY','Bill To',false,'billing_party']];
const CORE={CUSTOMER:'customer_id',SHIPPER:'shipper_id',CONSIGNEE:'consignee_id'};
let ctrls=[],renderToken=0;

function ctx(){if(!main?.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return null;const shell=main.querySelector('[data-txw-shell^="SHIPMENT:"]');if(!shell)return null;const id=(shell.dataset.txwShell||'').split(':')[1],panel=shell.querySelector('[data-txw-panel]');return id&&panel?{shell,id,panel}:null}
function destroy(){ctrls.forEach(c=>c?.destroy?.());ctrls=[]}
async function txFor(id){const{data,error}=await supabase.from('transactions').select('id,organization_id').eq('transaction_type','SHIPMENT').eq('domain_record_id',id).maybeSingle();if(error)throw error;return data}
async function projection(id){const{data,error}=await supabase.from('shipments').select('customer_id,shipper_id,consignee_id').eq('id',id).single();if(error)throw error;return data||{}}
async function entities(){const org=await getCurrentOrganizationId();const{data,error}=await supabase.from('entities').select('id,name,code,roles').eq('organization_id',org).order('name').limit(2000);if(error)throw error;return data||[]}
async function parties(txid){const{data,error}=await supabase.from('transaction_parties').select('*').eq('transaction_id',txid).eq('is_primary',true);if(error)throw error;return data||[]}
async function setEntity(c,tx,role,e){const{error}=await supabase.rpc('nodara_add_transaction_party',{p_transaction_id:tx.id,p_role_code:role,p_entity_id:e.id,p_contact_id:null,p_address_id:null,p_is_primary:true,p_provenance:{source_type:'USER',surface:'SHIPMENT_PARTIES_V40'},p_metadata:{}});if(error)throw error;const f=CORE[role];if(f){const{error:ue}=await supabase.from('shipments').update({[f]:e.id,updated_at:new Date().toISOString()}).eq('id',c.id);if(ue)throw ue}window.nodaraTransactionWorkspace?.invalidate?.('SHIPMENT',c.id)}
async function setTyped(c,tx,role,name){const v=String(name||'').trim();if(!v)return;await supabase.from('transaction_parties').update({is_primary:false,updated_at:new Date().toISOString()}).eq('transaction_id',tx.id).eq('role_code',role).eq('is_primary',true);const{error}=await supabase.from('transaction_parties').insert({organization_id:tx.organization_id,transaction_id:tx.id,role_code:role,party_name_snapshot:v,is_primary:true,source:'USER',provenance:{source_type:'USER',surface:'SHIPMENT_PARTIES_V40'},metadata:{transaction_only:true}});if(error)throw error;const f=CORE[role];if(f){const{error:ue}=await supabase.from('shipments').update({[f]:null,updated_at:new Date().toISOString()}).eq('id',c.id);if(ue)throw ue}window.nodaraTransactionWorkspace?.invalidate?.('SHIPMENT',c.id)}
async function clearParty(c,tx,role,p){const f=CORE[role];if(f)await supabase.from('shipments').update({[f]:null,updated_at:new Date().toISOString()}).eq('id',c.id);if(p?.id)await supabase.rpc('nodara_remove_transaction_party',{p_party_id:p.id,p_provenance:{source_type:'USER',surface:'SHIPMENT_PARTIES_V40'}});window.nodaraTransactionWorkspace?.invalidate?.('SHIPMENT',c.id)}
async function createEntity(roleHint,name){const org=await getCurrentOrganizationId();const{data,error}=await supabase.from('entities').insert({organization_id:org,name:String(name||'').trim(),roles:[roleHint]}).select('id,name,code,roles').single();if(error)throw error;return data}

async function renderParties(){
 const c=ctx();if(!c)return;const token=++renderToken;destroy();
 c.shell.querySelectorAll('[data-txw-tab]').forEach(b=>b.classList.toggle('active',b.dataset.txwTab==='parties'));main.dataset.txwTab='parties';
 c.panel.innerHTML='<div class="txw-empty">Loading shipment parties…</div>';
 try{
  const tx=await txFor(c.id);if(!tx||token!==renderToken)return;
  const[proj,ents,ps]=await Promise.all([projection(c.id),entities(),parties(tx.id)]);if(token!==renderToken)return;
  c.panel.innerHTML=`<section class="sh40-parties"><div class="sh37-head"><div><b>Shipment parties</b><small>Type to search · use this shipment only · or create a reusable record.</small></div></div><div class="sh37-party-grid">${ROLES.map(r=>`<div class="sh37-party-slot" data-v40-role="${r[0]}"></div>`).join('')}</div></section>`;
  for(const[role,label,required,roleHint]of ROLES){
   const p=ps.find(x=>String(x.role_code).toUpperCase()===role),id=CORE[role]?proj[CORE[role]]:p?.entity_id,currentEntity=ents.find(x=>x.id===id);let local=[...ents];const host=c.panel.querySelector(`[data-v40-role="${role}"]`);
   const ctrl=mountRecordResolver(host,{label,required,value:currentEntity?.name||p?.party_name_snapshot||'',status:currentEntity?'Saved entity':p?.party_name_snapshot?'Transaction only':'',placeholder:`Search or type ${label.toLowerCase()}…`,search:q=>{const n=String(q||'').toLowerCase();return local.filter(x=>!n||[x.name,x.code,...(x.roles||[])].filter(Boolean).some(v=>String(v).toLowerCase().includes(n)))},formatResult:e=>({title:e.name,subtitle:[e.code,(e.roles||[]).join(', ')].filter(Boolean).join(' · ')||'Saved entity'}),typedLabel:'Use “{value}” only on this shipment',createLabel:'Create “{value}” as a reusable record',onSelect:async e=>{await setEntity(c,tx,role,e);ctrl.setValue(e.name,'Saved entity')},onUseTyped:async v=>{await setTyped(c,tx,role,v);ctrl.setValue(v,'Transaction only')},onCreate:async v=>{const e=await createEntity(roleHint,v);local.push(e);await setEntity(c,tx,role,e);ctrl.setValue(e.name,'Saved entity');return e},onClear:async()=>clearParty(c,tx,role,p)});
   ctrls.push(ctrl);
  }
 }catch(err){if(token===renderToken)c.panel.innerHTML=`<div class="txw-empty">Could not load parties: ${String(err?.message||err)}</div>`}
}

// Own the Parties tab at WINDOW capture phase, before older document-level shipment handlers.
// This prevents two different shipment renderers from replacing fields after Safari has focused them.
window.addEventListener('click',e=>{
 const tab=e.target.closest?.('[data-txw-tab="parties"]');if(!tab||!ctx())return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();renderParties();
},true);

// If a shipment opens with Parties already selected, claim it once after the shell settles.
setTimeout(()=>{if(main?.dataset.txwType==='SHIPMENT'&&main.dataset.txwTab==='parties')renderParties()},350);

window.nodaraShipmentPartiesV40={render:renderParties};
