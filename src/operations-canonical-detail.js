import { supabase } from './supabase-client.js';
import { loadTransactionReadModel, transactionCargoSummary } from './transaction-read-model.js?v=20260907-2';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString():'—';
const n=(v,d=2)=>Number(v||0).toLocaleString(undefined,{maximumFractionDigits:d});
const money=(v,c='USD')=>new Intl.NumberFormat(undefined,{style:'currency',currency:c||'USD'}).format(Number(v||0));
const label=s=>String(s||'').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

function partyName(p){return p?.party_name_snapshot||p?.entity_name_snapshot||p?.name_snapshot||p?.display_name||p?.entity?.name||'—'}
function refValue(r){return r?.reference_value||r?.value||'—'}
function noteText(x){return x?.body||x?.note_text||x?.content||x?.text||''}

function section(title,body,count){return `<section class="record-section canonical-contract-section"><div class="section-heading"><h3>${esc(title)}</h3>${count!=null?`<small class="muted">${count}</small>`:''}</div>${body}</section>`}
function empty(text){return `<div class="muted">${esc(text)}</div>`}

export function renderCanonicalContract(model){
 const parties=model?.parties||[],refs=model?.references||[],milestones=model?.milestones||[],docs=model?.documents?.items||[],charges=model?.charges||[],notes=model?.notes||[],reqs=model?.requirements||[],rels=model?.relationships||[],calcs=model?.calculations||[];
 const cargo=transactionCargoSummary(model);
 const partyHtml=parties.length?`<div class="detail-grid">${parties.map(p=>`<div><span>${esc(label(p.role_code))}</span><b>${esc(partyName(p))}</b></div>`).join('')}</div>`:empty('No canonical parties.');
 const refHtml=refs.length?`<div class="detail-grid">${refs.map(r=>`<div><span>${esc(label(r.reference_type))}</span><b>${esc(refValue(r))}</b></div>`).join('')}</div>`:empty('No references.');
 const milestoneHtml=milestones.length?`<div class="detail-grid">${milestones.map(m=>`<div><span>${esc(label(m.label||m.milestone_type||m.milestone_code))} · ${esc(label(m.time_basis||m.basis))}</span><b>${esc(fmt(m.milestone_at||m.milestone_date))}</b></div>`).join('')}</div>`:empty('No milestones yet.');
 const cargoHtml=`<div class="detail-grid"><div><span>Handling quantity</span><b>${n(cargo.handlingQuantity,3)}</b></div><div><span>Gross weight</span><b>${n(cargo.grossWeightKg,3)} KG</b></div><div><span>Volume</span><b>${n(cargo.volumeCbm,6)} CBM</b></div><div><span>Current calculations</span><b>${calcs.length}</b></div></div>`;
 const commercialHtml=`<div class="detail-grid"><div><span>Documents</span><b>${docs.length}</b></div><div><span>Charges</span><b>${charges.length}</b></div><div><span>Sell total</span><b>${money(charges.reduce((s,x)=>s+Number(x.sell_amount??x.amount??0),0),charges[0]?.currency||'USD')}</b></div><div><span>Relationships</span><b>${rels.length}</b></div></div>`;
 const noteHtml=notes.length?notes.map(x=>`<div class="notice"><b>${esc(label(x.note_type||'NOTE'))}</b>${x.visibility?` · <small>${esc(label(x.visibility))}</small>`:''}<div>${esc(noteText(x))}</div></div>`).join(''):empty('No canonical notes.');
 const reqHtml=reqs.length?reqs.map(x=>`<div class="notice"><b>${esc(x.title||x.requirement_name||x.requirement_code||'Requirement')}</b><div>${esc(label(x.status||'OPEN'))}${x.blocking?' · Blocking':''}</div></div>`).join(''):empty('No active requirements.');
 return `<div class="canonical-contract" data-canonical-transaction="${esc(model?.transaction?.id||'')}"><div class="eyebrow">Canonical transaction</div>${section('Parties',partyHtml,parties.length)}${section('References',refHtml,refs.length)}${section('Cargo',cargoHtml)}${section('Milestones',milestoneHtml,milestones.length)}${section('Documents & Charges',commercialHtml)}${section('Notes',noteHtml,notes.length)}${section('Requirements',reqHtml,reqs.length)}</div>`;
}

let run=0;
async function enhance(){
 const token=++run;
 if(!main||main.querySelector('.canonical-contract'))return;
 const title=main.querySelector('.record-header .title')?.textContent?.trim();
 const eyebrow=main.querySelector('.record-header .eyebrow')?.textContent?.trim()||'';
 if(!title||!eyebrow.startsWith('Operations ·'))return;
 const subtype=eyebrow.split('·').pop().trim().toUpperCase();
 let type,id;
 if(['AIR','OCEAN','GROUND'].includes(subtype)){
   const{data}=await supabase.from('shipments').select('id').eq('shipment_number',title).maybeSingle();type='SHIPMENT';id=data?.id;
 }else if(['PICKUP','DELIVERY','TRANSFER','DRAYAGE'].includes(subtype)){
   const{data}=await supabase.from('transport_orders').select('id').eq('order_number',title).maybeSingle();type='TRANSPORT_ORDER';id=data?.id;
 }else return;
 if(!id||token!==run)return;
 try{
   const model=await loadTransactionReadModel(type,id);
   if(!model||token!==run||main.querySelector('.canonical-contract'))return;
   main.insertAdjacentHTML('beforeend',renderCanonicalContract(model));
 }catch(err){console.warn('[NODARA] canonical transaction detail unavailable',err);}
}

const observer=new MutationObserver(()=>queueMicrotask(enhance));
if(main){observer.observe(main,{childList:true,subtree:true});queueMicrotask(enhance);}

window.nodaraCanonicalOperationsDetail={enhance,renderCanonicalContract};
