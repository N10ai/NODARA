import { supabase } from './supabase-client.js';

const TYPE_ALIASES={WR:'WAREHOUSE_RECEIPT',WAREHOUSE_RECEIPT:'WAREHOUSE_RECEIPT',CR:'CARGO_RELEASE',CARGO_RELEASE:'CARGO_RELEASE',SHIPMENT:'SHIPMENT',TRANSPORT:'TRANSPORT_ORDER',TO:'TRANSPORT_ORDER',TRANSPORT_ORDER:'TRANSPORT_ORDER'};
export const normalizeTransactionType=t=>TYPE_ALIASES[String(t||'').toUpperCase()]||String(t||'').toUpperCase();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=2)=>Number(v||0).toLocaleString(undefined,{maximumFractionDigits:d});
const fmtDate=v=>v?new Date(v).toLocaleString():'—';

export async function resolveRegistryTransaction(transactionType,domainRecordId){
  const type=normalizeTransactionType(transactionType);
  const{data,error}=await supabase.from('transactions').select('*').eq('transaction_type',type).eq('domain_record_id',domainRecordId).maybeSingle();
  if(error)throw error;
  return data||null;
}

export async function loadTransactionReadModelById(registryTransactionId){
  let{data,error}=await supabase.rpc('nodara_get_transaction_workspace',{p_transaction_id:registryTransactionId});
  if(error&&/does not exist|schema cache/i.test(error.message||''))({data,error}=await supabase.rpc('nodara_get_transaction_read_model',{p_transaction_id:registryTransactionId}));
  if(error)throw error;
  return data||null;
}

export async function loadTransactionReadModel(transactionType,domainRecordId){
  const tx=await resolveRegistryTransaction(transactionType,domainRecordId);
  if(!tx)return null;
  return loadTransactionReadModelById(tx.id);
}

export function transactionCargoSummary(model){
  const t=model?.cargo_totals||{};
  return {handlingQuantity:Number(t.handling_units||0),grossWeightKg:Number(t.gross_weight_kg||0),volumeCbm:Number(t.volume_cbm||0)};
}

export function primaryParty(model,roleCode){
  const role=String(roleCode||'').toUpperCase(),rows=model?.parties||[];
  return rows.find(x=>String(x.role_code||'').toUpperCase()===role&&x.is_primary)||rows.find(x=>String(x.role_code||'').toUpperCase()===role)||null;
}

export function referencesByType(model,referenceType){
  const type=String(referenceType||'').toUpperCase();
  return (model?.references||[]).filter(x=>String(x.reference_type||'').toUpperCase()===type);
}

function partyName(p){return p?.party_name_snapshot||p?.contact_snapshot?.name||'—'}
function money(v,c='USD'){return new Intl.NumberFormat(undefined,{style:'currency',currency:c||'USD'}).format(Number(v||0))}

export function renderCanonicalTransactionSections(model,{showEmpty=false}={}){
  if(!model)return '<section class="record-section"><div class="notice warning">Canonical transaction projection unavailable.</div></section>';
  const parties=model.parties||[],refs=model.references||[],cargo=model.cargo||[],tot=model.cargo_totals||{},milestones=model.milestones||[],docs=model.documents?.items||[],charges=model.charges||[],notes=model.notes||[],reqs=model.requirements||[];
  const sections=[];

  if(showEmpty||parties.length||refs.length){
    sections.push(`<section class="record-section"><div class="section-heading"><h3>Parties & References</h3></div><div class="detail-grid">${parties.map(p=>`<div><span>${esc(String(p.role_code||'Party').replaceAll('_',' '))}</span><b>${esc(partyName(p))}</b>${p.is_primary?'<small>Primary</small>':''}</div>`).join('')}${refs.map(r=>`<div><span>${esc(String(r.reference_type||'Reference').replaceAll('_',' '))}</span><b>${esc(r.reference_value||'—')}</b>${r.is_primary?'<small>Primary</small>':''}</div>`).join('')||'<div><span>References</span><b>—</b></div>'}</div></section>`);
  }

  if(showEmpty||cargo.length){
    sections.push(`<section class="record-section"><div class="section-heading"><h3>Cargo</h3><span>${num(tot.handling_units)} handling qty · ${num(tot.gross_weight_kg)} KG · ${num(tot.volume_cbm,4)} CBM</span></div><div class="cargo-ws-table"><div class="cargo-ws-cols"><span></span><span>Cargo</span><span>Qty</span><span>Weight</span><span>Volume</span><span>Status</span><span></span></div>${cargo.map(x=>{const c=x.cargo_object||{},s=x.measurement_semantics||{};const gross=c.calculated_gross_weight_kg??null,vol=c.calculated_volume_cbm??c.volume_cbm??null;return `<div class="cargo-ws-row"><span></span><div class="cargo-ws-main"><b>${esc(c.metadata?.part_number||c.metadata?.sku||c.cargo_code||c.description||c.package_type||'Cargo')}</b><small>${esc([c.package_type,s.gross_weight_basis?`weight ${String(s.gross_weight_basis).toLowerCase().replace('_',' ')}`:'',s.dimensions_basis?`dims ${String(s.dimensions_basis).toLowerCase().replace('_',' ')}`:''].filter(Boolean).join(' · '))}</small></div><div><b>${num(c.quantity)} ${esc(c.uom||c.package_type||'')}</b><small>Handling</small></div><div><b>${gross==null?'—':`${num(gross)} KG`}</b><small>Calculated total</small></div><div><b>${vol==null?'—':`${num(vol,4)} CBM`}</b><small>Calculated total</small></div><div><b>${esc(c.status||'—')}</b></div><span></span></div>`}).join('')||'<div class="empty compact">No cargo assigned.</div>'}</div></section>`);
  }

  if(showEmpty||milestones.length){
    sections.push(`<section class="record-section"><div class="section-heading"><h3>Milestones</h3></div><div class="detail-grid">${milestones.map(m=>`<div><span>${esc(m.label||String(m.milestone_code||'Milestone').replaceAll('_',' '))}</span><b>${esc(m.time_basis||'')}</b><small>${esc(m.milestone_at?fmtDate(m.milestone_at):(m.milestone_date||'—'))}</small></div>`).join('')||'<div><span>Milestones</span><b>—</b></div>'}</div></section>`);
  }

  if(showEmpty||docs.length||charges.length){
    sections.push(`<section class="record-section"><div class="section-heading"><h3>Documents & Charges</h3></div><div class="detail-grid"><div><span>Documents</span><b>${docs.length}</b><small>${esc(docs.slice(0,3).map(d=>d.display_name||d.file_name||d.document_type).filter(Boolean).join(' · ')||'No documents')}</small></div><div><span>Charges</span><b>${charges.length}</b><small>${esc(charges.slice(0,3).map(c=>`${c.description||c.unit||'Charge'} ${money(c.sell_amount,c.currency)}`).join(' · ')||'No charges')}</small></div></div></section>`);
  }

  if(showEmpty||notes.length||reqs.length){
    sections.push(`<section class="record-section"><div class="section-heading"><h3>Notes & Requirements</h3></div>${notes.length?notes.map(n=>`<div class="notice"><b>${esc(n.note_type||'NOTE')}</b> · ${esc(n.body||'')}</div>`).join(''):'<div class="notice">No canonical notes.</div>'}${reqs.length?`<div class="detail-grid" style="margin-top:12px">${reqs.map(r=>`<div><span>${esc(r.label||r.requirement_code||'Requirement')}</span><b>${esc(r.status||'PENDING')}</b>${r.blocking?'<small>Blocking</small>':''}</div>`).join('')}</div>`:''}</section>`);
  }

  return sections.join('');
}

export default {normalizeTransactionType,resolveRegistryTransaction,loadTransactionReadModelById,loadTransactionReadModel,transactionCargoSummary,primaryParty,referencesByType,renderCanonicalTransactionSections};
