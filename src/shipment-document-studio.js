import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const SHIPMENT_DOCUMENT_CATALOG={
  AIR:[
    {code:'HAWB',label:'House Air Waybill',group:'Transport',scope:'HOUSE',kind:'OPERATIONAL'},
    {code:'MAWB',label:'Master Air Waybill',group:'Transport',scope:'MASTER',kind:'CARRIER_CONTROLLED'},
    {code:'AIR_MANIFEST',label:'Air Cargo Manifest',group:'Cargo',scope:'SHIPMENT',kind:'OPERATIONAL'},
    {code:'CONSOL_MANIFEST',label:'Consolidation Manifest',group:'Cargo',scope:'CONSOLIDATION',kind:'OPERATIONAL'},
    {code:'LOADING_GUIDE',label:'Loading Guide',group:'Cargo',scope:'SHIPMENT',kind:'OPERATIONAL'},
    {code:'DELIVERY_ORDER',label:'Delivery Order',group:'Release',scope:'SHIPMENT',kind:'OPERATIONAL'},
    {code:'ARRIVAL_NOTICE',label:'Arrival Notice',group:'Release',scope:'SHIPMENT',kind:'OPERATIONAL'},
    {code:'SLI',label:"Shipper's Letter of Instruction",group:'Instructions',scope:'SHIPMENT',kind:'OPERATIONAL'},
    {code:'PACKING_LIST',label:'Packing List',group:'Commercial',scope:'SHIPMENT',kind:'SUPPORTING'},
    {code:'TSA_LETTER',label:'TSA / Security Letter',group:'Compliance',scope:'SHIPMENT',kind:'CONTROLLED'},
    {code:'PICKUP_ORDER',label:'Pickup Order',group:'Ground',scope:'SHIPMENT',kind:'OPERATIONAL'},
    {code:'POD',label:'Proof of Delivery',group:'Ground',scope:'SHIPMENT',kind:'EVIDENCE'}
  ]
};

function addStyles(){
  if(document.getElementById('shipment-document-studio-style'))return;
  const s=document.createElement('style');s.id='shipment-document-studio-style';s.textContent=`
    .shipment-doc-studio{margin-top:18px}.shipment-doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}
    .shipment-doc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.shipment-doc-card{border:1px solid var(--line,#2b313b);border-radius:14px;padding:14px;background:var(--card,#11151c);display:flex;flex-direction:column;gap:10px;min-height:132px}
    .shipment-doc-card h4{margin:0;font-size:14px}.shipment-doc-card p{margin:0;font-size:12px;opacity:.68;line-height:1.35}.shipment-doc-card .doc-meta{font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.55}.shipment-doc-card .doc-actions{display:flex;gap:8px;margin-top:auto;flex-wrap:wrap}.shipment-doc-card button{min-height:36px}
    @media(max-width:700px){.shipment-doc-grid{grid-template-columns:1fr}.shipment-doc-head{flex-direction:column}}
  `;document.head.appendChild(s);
}

function currentShipmentNumber(){return main.querySelector('.record-header h1.title')?.textContent?.trim()||''}
async function loadShipment(){const number=currentShipmentNumber();if(!number)return null;const{data,error}=await supabase.from('shipments').select('*').eq('shipment_number',number).maybeSingle();if(error)throw error;return data}

function shipmentFacts(s){const m=s?.metadata||{},md=m.mode_details||{};return{
  shipmentNumber:s?.shipment_number||'',
  house:s?.house_reference||'',master:s?.master_reference||'',booking:s?.booking_reference||'',
  origin:s?.origin_code||s?.origin_name||'',destination:s?.destination_code||s?.destination_name||'',
  etd:s?.etd||md.flight_date||'',eta:s?.eta||'',airline:md.airline||'',flight:md.flight_number||'',service:md.service_level||'',
  pieces:m.total_pieces||m.pieces||'',weight:m.total_weight||m.weight||'',chargeable:md.chargeable_weight||'',description:m.cargo_description||m.description||'',
  shipper:m.shipper_name||'',consignee:m.consignee_name||'',customer:m.customer_name||'',handling:md.handling_info||'',security:md.security_status||''
}}

function rows(f){return [
  ['Shipment',f.shipmentNumber],['House reference',f.house],['Master reference',f.master],['Booking',f.booking],
  ['Origin',f.origin],['Destination',f.destination],['Airline',f.airline],['Flight',f.flight],['ETD',f.etd],['ETA',f.eta],
  ['Pieces',f.pieces],['Weight',f.weight],['Chargeable weight',f.chargeable],['Description',f.description],['Handling',f.handling],['Security',f.security]
].filter(([,v])=>v!==''&&v!=null)}

function printDocument(doc,s){const f=shipmentFacts(s),title=`${doc.label} · ${f.shipmentNumber||'Shipment'}`;const note=doc.kind==='CARRIER_CONTROLLED'?'Carrier-controlled document: NODARA prepares shipment data for review/export; carrier-issued form remains authoritative.':doc.kind==='CONTROLLED'?'Controlled/compliance document: verify organization-specific wording and required signatures before issue.':'';
  const w=window.open('','_blank');if(!w)return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#111}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:22px}h1{font-size:22px;margin:0}.muted{color:#666;font-size:12px}.grid{display:grid;grid-template-columns:180px 1fr;border:1px solid #bbb;border-bottom:0}.grid div{padding:9px 10px;border-bottom:1px solid #bbb}.grid div:nth-child(odd){font-weight:700;background:#f5f5f5}.note{margin:18px 0;padding:12px;border:1px solid #ccc;background:#fafafa;font-size:12px}.footer{margin-top:28px;font-size:11px;color:#666}@media print{button{display:none}body{margin:15mm}}</style></head><body><button onclick="print()">Print / Save PDF</button><header><div><div class="muted">NODARA DOCUMENT STUDIO · ${esc(doc.code)}</div><h1>${esc(doc.label)}</h1></div><div><b>${esc(f.shipmentNumber)}</b><div class="muted">${esc(f.origin)} ${f.origin&&f.destination?'→':''} ${esc(f.destination)}</div></div></header>${note?`<div class="note">${esc(note)}</div>`:''}<div class="grid">${rows(f).map(([k,v])=>`<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div><div class="footer">Generated from the shipment record. Review operational, carrier, customs and security requirements before issuing.</div></body></html>`);w.document.close();
}

function renderCards(s){return SHIPMENT_DOCUMENT_CATALOG.AIR.map(doc=>`<article class="shipment-doc-card" data-doc="${doc.code}"><div class="doc-meta">${esc(doc.group)} · ${esc(doc.scope)}</div><h4>${esc(doc.label)}</h4><p>${doc.kind==='CARRIER_CONTROLLED'?'Prepare shipment data and working copy without misrepresenting it as a carrier-issued original.':'Generate from shipment data instead of retyping the same facts.'}</p><div class="doc-actions"><button class="secondary" data-preview-doc="${doc.code}">Preview / Print</button></div></article>`).join('')}

export async function mountShipmentDocumentStudio(){
  const eyebrow=main.querySelector('.record-header .eyebrow');if(!eyebrow||!/Operations · AIR/i.test(eyebrow.textContent||'')||document.getElementById('shipment-document-studio'))return;
  addStyles();const s=await loadShipment();if(!s)return;
  const section=document.createElement('section');section.id='shipment-document-studio';section.className='record-section shipment-doc-studio';section.innerHTML=`<div class="shipment-doc-head"><div><span class="section-kicker">DOCUMENTS</span><h3>Document Studio</h3><span class="muted">One shipment record feeds the air-freight document set.</span></div><span class="muted">${SHIPMENT_DOCUMENT_CATALOG.AIR.length} templates</span></div><div class="shipment-doc-grid">${renderCards(s)}</div>`;
  const target=document.getElementById('shipment-mode-record')||main.querySelector('.ops-record-grid .record-section')||main.querySelector('section.record-section');target?.after(section);
  section.addEventListener('click',e=>{const b=e.target.closest('[data-preview-doc]');if(!b)return;const doc=SHIPMENT_DOCUMENT_CATALOG.AIR.find(x=>x.code===b.dataset.previewDoc);if(doc)printDocument(doc,s)});
}

window.NodaraShipmentDocuments={catalog:SHIPMENT_DOCUMENT_CATALOG,mount:mountShipmentDocumentStudio};
