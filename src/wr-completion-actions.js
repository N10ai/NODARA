import { supabase } from './supabase-client.js';
import { printReceivingLabels } from './receiving-labels.js?v=20260902-0410';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
let currentNumber='',loading=false;

function css(){if(document.getElementById('wr-completion-actions-css'))return;const s=document.createElement('style');s.id='wr-completion-actions-css';s.textContent=`
.wr-completion-panel{margin:14px 0 16px;border:1px solid var(--border);border-radius:18px;padding:14px;background:color-mix(in srgb,var(--panel,#10141c) 96%,transparent)}
.wr-completion-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.wr-completion-head h3{margin:2px 0}.wr-completion-head small{color:var(--muted)}
.wr-completion-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.wr-completion-card{border:1px solid var(--border);border-radius:15px;padding:13px;display:flex;flex-direction:column;gap:10px;background:rgba(255,255,255,.015)}.wr-completion-card b{font-size:13px}.wr-completion-card small{color:var(--muted);line-height:1.4;min-height:38px}.wr-completion-card.done{border-color:color-mix(in srgb,#63d69a 45%,var(--border))}.wr-completion-actions{display:flex;gap:8px;flex-wrap:wrap}.wr-completion-actions button{flex:1;min-width:100px}
.wr-action-overlay{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:10000;display:grid;place-items:center;padding:16px}.wr-action-dialog{width:min(760px,100%);max-height:90vh;overflow:auto;background:var(--panel,#10141c);border:1px solid var(--border);border-radius:20px;padding:18px}.wr-action-dialog .section-heading{position:sticky;top:-18px;background:var(--panel,#10141c);padding:8px 0 12px;z-index:2}.wr-putaway-row{display:grid;grid-template-columns:1.5fr 1fr;gap:10px;align-items:end;padding:12px 0;border-bottom:1px solid var(--border)}.wr-putaway-row small{display:block;color:var(--muted);margin-top:3px}.wr-notify-body{min-height:180px}.wr-action-status{margin-top:10px}
@media(max-width:760px){.wr-completion-grid{grid-template-columns:1fr}.wr-putaway-row{grid-template-columns:1fr}.wr-action-dialog{padding:14px}}
`;document.head.appendChild(s)}

async function load(number){
 const{data:wr,error}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number,status,created_at,jobs(job_number,reference,description,customer_id)').eq('receipt_number',number).single();if(error)throw error;
 const[cargoRes,refsRes,partiesRes,locRes,customerRes]=await Promise.all([
  supabase.from('cargo_units').select('id,parent_id,uin,handling_unit_code,package_type,quantity,uom,description,warehouse_location_id,weight_lb,length_in,width_in,height_in').eq('job_id',wr.job_id).order('created_at'),
  supabase.from('shipment_references').select('reference_type,reference_value,is_primary').eq('warehouse_receipt_id',wr.id),
  supabase.from('warehouse_receipt_parties').select('role,display_name,email,entity_id,entities(name,email,sop)').eq('warehouse_receipt_id',wr.id),
  supabase.from('warehouse_locations').select('id,code,name').order('code').limit(2000),
  wr.jobs?.customer_id?supabase.from('entities').select('id,name,email,sop').eq('id',wr.jobs.customer_id).maybeSingle():Promise.resolve({data:null,error:null})
 ]);
 for(const x of[cargoRes,refsRes,partiesRes,locRes])if(x.error)throw x.error;
 const parties={};for(const p of partiesRes.data||[])parties[p.role]={...p,name:p.entities?.name||p.display_name||'',email:p.email||p.entities?.email||''};
 return{wr,cargo:cargoRes.data||[],refs:refsRes.data||[],parties,locations:locRes.data||[],customer:customerRes.data||null};
}

function stateKey(number){return `nodara:wr:completion:${number}`}
function getState(number){try{return JSON.parse(localStorage.getItem(stateKey(number))||'{}')}catch{return{}}}
function setState(number,patch){const next={...getState(number),...patch};localStorage.setItem(stateKey(number),JSON.stringify(next));return next}
function primaryRef(d){const r=d.refs.find(x=>x.is_primary)||d.refs[0];return r?.reference_value||d.wr.jobs?.reference||'—'}
function cargoText(d){const top=d.cargo.filter(x=>!x.parent_id),by={};for(const x of top){const k=x.package_type||'piece';by[k]=(by[k]||0)+Number(x.quantity||1)}return Object.entries(by).map(([k,v])=>`${v} ${k}`).join(', ')||'No cargo'}
function allPutAway(d){const top=d.cargo.filter(x=>!x.parent_id);return top.length>0&&top.every(x=>x.warehouse_location_id)}

function renderPanel(d){
 document.querySelector('.wr-completion-panel')?.remove();
 const header=main.querySelector('.record-header');if(!header)return;
 const st=getState(d.wr.receipt_number),putDone=allPutAway(d),notifyDone=!!st.notified,labelDone=!!st.labels;
 const panel=document.createElement('section');panel.className='wr-completion-panel';panel.innerHTML=`<div class="wr-completion-head"><div><div class="eyebrow">RECEIVING COMPLETION</div><h3>Finish the physical receipt</h3><small>These are actions, not checklist boxes. Complete the work from here.</small></div><span class="status-pill ${labelDone&&putDone&&notifyDone?'good':''}">${[labelDone,putDone,notifyDone].filter(Boolean).length}/3 complete</span></div><div class="wr-completion-grid">
 <div class="wr-completion-card ${labelDone?'done':''}"><b>1 · Labels</b><small>${labelDone?'Labels prepared for this WR.':'Print handling-unit labels from the actual received cargo.'}</small><div class="wr-completion-actions"><button class="secondary" data-wrc-label="4x6">4×6</button><button class="secondary" data-wrc-label="2x1">2×1</button></div></div>
 <div class="wr-completion-card ${putDone?'done':''}"><b>2 · Put Away</b><small>${putDone?'All top-level handling units have a warehouse location.':'Assign each top-level handling unit to its actual storage location.'}</small><div class="wr-completion-actions"><button class="primary" data-wrc-putaway>${putDone?'Review locations':'Assign locations'}</button></div></div>
 <div class="wr-completion-card ${notifyDone?'done':''}"><b>3 · Notify</b><small>${notifyDone?'Receiving communication was prepared/confirmed.':'Generate the customer receiving completion email from this WR.'}</small><div class="wr-completion-actions"><button class="primary" data-wrc-notify>${notifyDone?'Open again':'Prepare email'}</button></div></div>
 </div>`;
 header.insertAdjacentElement('afterend',panel);
 panel.querySelectorAll('[data-wrc-label]').forEach(b=>b.onclick=()=>{printReceivingLabels({wr:{...d.wr,references:d.refs,parties:d.parties,customer:d.customer},cargo:d.cargo,size:b.dataset.wrcLabel});setState(d.wr.receipt_number,{labels:true,label_at:new Date().toISOString()});renderPanel(d)});
 panel.querySelector('[data-wrc-putaway]').onclick=()=>openPutaway(d);
 panel.querySelector('[data-wrc-notify]').onclick=()=>openNotify(d);
 if(sessionStorage.getItem('nodara:wr:continue-after-create')==='1'){sessionStorage.removeItem('nodara:wr:continue-after-create');setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),120)}
}

function openPutaway(d){
 const top=d.cargo.filter(x=>!x.parent_id),overlay=document.createElement('div');overlay.className='wr-action-overlay';
 overlay.innerHTML=`<div class="wr-action-dialog"><div class="section-heading"><div><div class="eyebrow">PUT AWAY</div><h3>Assign actual storage locations</h3><span class="muted">One location per top-level handling unit. Nested contents remain under their parent unless moved separately.</span></div><button class="subtle" data-close>×</button></div><div>${top.map(x=>`<div class="wr-putaway-row" data-unit="${x.id}"><div><b>${esc(x.uin||x.handling_unit_code||x.package_type||'Handling unit')}</b><small>${esc(`${Number(x.quantity||1)} ${x.uom||''} · ${x.description||x.package_type||''}`)}</small></div><div class="field"><label>Location</label><select data-location><option value="">Choose location…</option>${d.locations.map(l=>`<option value="${l.id}" ${x.warehouse_location_id===l.id?'selected':''}>${esc(l.code)}${l.name?' · '+esc(l.name):''}</option>`).join('')}</select></div></div>`).join('')||'<div class="notice warning">No top-level cargo exists on this WR.</div>'}</div><div class="dialog-actions"><button class="secondary" data-close>Cancel</button><button class="primary" data-save-putaway>Confirm Put Away</button></div><div class="wr-action-status"></div></div>`;
 document.body.appendChild(overlay);overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>overlay.remove());
 overlay.querySelector('[data-save-putaway]').onclick=async()=>{const rows=[...overlay.querySelectorAll('[data-unit]')],missing=rows.find(r=>!r.querySelector('[data-location]').value);if(missing){overlay.querySelector('.wr-action-status').innerHTML='<div class="notice warning">Assign a location to every top-level handling unit before confirming put away.</div>';return}const btn=overlay.querySelector('[data-save-putaway]');btn.disabled=true;btn.textContent='Saving…';try{for(const row of rows){const id=row.dataset.unit,loc=row.querySelector('[data-location]').value;const{error}=await supabase.from('cargo_units').update({warehouse_location_id:loc}).eq('id',id);if(error)throw error;const item=d.cargo.find(x=>x.id===id);if(item)item.warehouse_location_id=loc}setState(d.wr.receipt_number,{putaway:true,putaway_at:new Date().toISOString()});overlay.remove();renderPanel(d)}catch(e){btn.disabled=false;btn.textContent='Confirm Put Away';overlay.querySelector('.wr-action-status').innerHTML=`<div class="notice warning">${esc(e.message)}</div>`}}
}

function notifyRecipients(d){const sop=d.customer?.sop||d.parties.customer?.entities?.sop||{},contacts=Array.isArray(sop.contacts)?sop.contacts:[],emails=[];const add=v=>{const x=String(v||'').trim();if(x&&x.includes('@')&&!emails.includes(x))emails.push(x)};add(d.parties.customer?.email);add(d.customer?.email);contacts.filter(c=>!c.roles?.length||c.roles.some(r=>['primary','operations','warehouse','receiving'].includes(String(r).toLowerCase()))).forEach(c=>add(c.email));return emails}
function openNotify(d){
 const recipients=notifyRecipients(d),subject=`Warehouse Receipt ${d.wr.receipt_number} received`,top=d.cargo.filter(x=>!x.parent_id),locationMap=new Map(d.locations.map(x=>[x.id,x.code])),locations=[...new Set(top.map(x=>locationMap.get(x.warehouse_location_id)).filter(Boolean))].join(', '),body=`Hello,\n\nWe have completed receiving for ${d.wr.receipt_number}.\n\nReference: ${primaryRef(d)}\nCargo received: ${cargoText(d)}\n${locations?`Put-away location${locations.includes(',')?'s':''}: ${locations}\n`:''}\nPlease let us know if you need anything else regarding this receipt.\n\nThank you.`;
 const overlay=document.createElement('div');overlay.className='wr-action-overlay';overlay.innerHTML=`<div class="wr-action-dialog"><div class="section-heading"><div><div class="eyebrow">CUSTOMER NOTIFICATION</div><h3>Receiving completion email</h3><span class="muted">Generated from the actual WR. Review before sending.</span></div><button class="subtle" data-close>×</button></div><div class="field"><label>To</label><input data-to value="${esc(recipients.join(', '))}" placeholder="customer@example.com"></div><div class="field"><label>Subject</label><input data-subject value="${esc(subject)}"></div><div class="field"><label>Message</label><textarea class="wr-notify-body" data-body>${esc(body)}</textarea></div><div class="notice">NODARA prepares the complete email here. Until a transactional email provider is connected to the app, Send opens your device's mail composer with the recipient, subject and message filled in.</div><div class="dialog-actions"><button class="secondary" data-copy>Copy</button><button class="primary" data-open-mail>Open Email & Send</button></div><div class="wr-action-status"></div></div>`;document.body.appendChild(overlay);overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
 overlay.querySelector('[data-copy]').onclick=async()=>{const text=`To: ${overlay.querySelector('[data-to]').value}\nSubject: ${overlay.querySelector('[data-subject]').value}\n\n${overlay.querySelector('[data-body]').value}`;await navigator.clipboard?.writeText(text);overlay.querySelector('.wr-action-status').innerHTML='<div class="notice good">Copied.</div>'};
 overlay.querySelector('[data-open-mail]').onclick=()=>{const to=overlay.querySelector('[data-to]').value.trim(),sub=overlay.querySelector('[data-subject]').value,txt=overlay.querySelector('[data-body]').value;if(!to){overlay.querySelector('.wr-action-status').innerHTML='<div class="notice warning">Add at least one recipient.</div>';return}setState(d.wr.receipt_number,{notified:true,notify_at:new Date().toISOString(),notify_to:to});window.location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(txt)}`;renderPanel(d)}
}

async function install(){css();const number=main.querySelector('.record-number')?.textContent?.trim();if(!number?.startsWith('WR-')||number===currentNumber||loading)return;loading=true;try{const d=await load(number);currentNumber=number;renderPanel(d)}catch(e){console.warn('WR completion actions unavailable',e)}finally{loading=false}}
new MutationObserver(()=>{if(!main.querySelector('.record-number'))currentNumber='';setTimeout(install,80)}).observe(main,{childList:true,subtree:true});setTimeout(install,500);
