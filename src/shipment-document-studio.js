import { supabase } from './supabase-client.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COMMON=[
 {code:'CARGO_MANIFEST',label:'Cargo Manifest',group:'Cargo',scope:'SHIPMENT'},
 {code:'PACKING_LIST',label:'Packing List',group:'Commercial',scope:'SHIPMENT'},
 {code:'DELIVERY_ORDER',label:'Delivery Order',group:'Release',scope:'SHIPMENT'},
 {code:'ARRIVAL_NOTICE',label:'Arrival Notice',group:'Release',scope:'SHIPMENT'},
 {code:'DGD',label:"Shipper's Declaration for Dangerous Goods",group:'Dangerous Goods',scope:'SHIPMENT',controlled:true},
 {code:'BATTERY_LETTER',label:'Lithium Battery Statement / Letter',group:'Dangerous Goods',scope:'SHIPMENT',controlled:true},
 {code:'POD',label:'Proof of Delivery',group:'Evidence',scope:'SHIPMENT'}
];
export const SHIPMENT_DOCUMENT_CATALOG={
 AIR:[
  {code:'HAWB',label:'House Air Waybill',group:'Air Waybill',scope:'HOUSE',terms:true},
  {code:'MAWB_DATA',label:'Master Air Waybill Working Copy',group:'Air Waybill',scope:'MASTER',carrier:true},
  {code:'AIR_MANIFEST',label:'Air Cargo Manifest',group:'Cargo',scope:'SHIPMENT'},
  {code:'TSA_SECURITY_LETTER',label:'TSA / Air Cargo Security Letter',group:'Security',scope:'SHIPMENT',controlled:true},
  {code:'KNOWN_SHIPPER_LETTER',label:'Known / Unknown Shipper Letter',group:'Security',scope:'SHIPMENT',controlled:true},
  {code:'SLI',label:"Shipper's Letter of Instruction",group:'Instructions',scope:'SHIPMENT'},
  {code:'LOADING_GUIDE',label:'Air Loading Guide',group:'Cargo',scope:'SHIPMENT'},...COMMON
 ],
 OCEAN:[
  {code:'HBL',label:'House Bill of Lading',group:'Bill of Lading',scope:'HOUSE',terms:true},
  {code:'MBL_INSTRUCTIONS',label:'Master B/L Instructions',group:'Bill of Lading',scope:'MASTER',carrier:true},
  {code:'OCEAN_MANIFEST',label:'Ocean Cargo Manifest',group:'Cargo',scope:'SHIPMENT'},
  {code:'VGM',label:'Verified Gross Mass (VGM)',group:'Ocean Compliance',scope:'SHIPMENT',controlled:true},
  {code:'IMO_DGD',label:'IMO Dangerous Goods Declaration',group:'Dangerous Goods',scope:'SHIPMENT',controlled:true},
  {code:'LOADING_GUIDE',label:'Container / Loading Guide',group:'Cargo',scope:'SHIPMENT'},...COMMON
 ],
 GROUND:[{code:'BOL',label:'Bill of Lading',group:'Transport',scope:'SHIPMENT',terms:true},...COMMON]
};

function facts(s){return [['Shipment',s.shipment_number],['Mode / direction',`${s.mode} · ${s.direction||'—'}`],['Master reference',s.master_reference],['House reference',s.house_reference],['Booking',s.booking_reference],['Origin',s.origin_code||s.origin_name],['Destination',s.destination_code||s.destination_name],['Pieces',s.pieces],['Gross weight',s.weight==null?'':`${s.weight} ${s.weight_unit||'KG'}`],['Volume',s.volume_cbm==null?'':`${s.volume_cbm} CBM`],['ETD',s.etd?new Date(s.etd).toLocaleString():null],['ETA',s.eta?new Date(s.eta).toLocaleString():null]].filter(([,v])=>v!==null&&v!==undefined&&v!=='')}

async function draft(doc,s){const snapshot={shipment_number:s.shipment_number,mode:s.mode,direction:s.direction,master_reference:s.master_reference,house_reference:s.house_reference,booking_reference:s.booking_reference,origin:s.origin_code||s.origin_name,destination:s.destination_code||s.destination_name,pieces:s.pieces,weight:s.weight,weight_unit:s.weight_unit,volume_cbm:s.volume_cbm,generated_at:new Date().toISOString()};const{data,error}=await supabase.from('shipment_document_issues').insert({organization_id:s.organization_id,shipment_id:s.id,document_code:doc.code,document_scope:doc.scope,status:'DRAFT',data_snapshot:snapshot}).select().single();if(error)throw error;return data}

function printDoc(doc,s,issue){const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to preview this document.');const warning=doc.carrier?'WORKING COPY — carrier-issued master document remains authoritative.':doc.controlled?'CONTROLLED DOCUMENT — complete required declarations, approvals and signatures before issue.':'';w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.label)} · ${esc(s.shipment_number)}</title><style>@page{size:letter;margin:.45in}*{box-sizing:border-box}body{font:11px Arial;color:#111;margin:0}header{display:flex;justify-content:space-between;border-bottom:3px solid #111;padding-bottom:12px}h1{font-size:22px;margin:4px 0}.brand{font-weight:900;letter-spacing:3px;font-size:17px}.tag{font-size:8px;letter-spacing:1.5px}.warn{margin:14px 0;padding:9px;border:1px solid #111;font-weight:700}.grid{display:grid;grid-template-columns:180px 1fr;border:1px solid #999;margin-top:18px}.grid div{padding:9px;border-bottom:1px solid #ccc}.grid div:nth-child(odd){font-weight:700;background:#f5f5f5}.terms{margin-top:22px;border-top:1px solid #999;padding-top:12px;font-size:9px;line-height:1.45}.sign{display:grid;grid-template-columns:1fr 1fr;gap:35px;margin-top:38px}.sign div{border-top:1px solid #111;padding-top:5px}.foot{margin-top:25px;font-size:8px;color:#555}@media print{button{display:none}}</style></head><body><button onclick="print()">Print / Save PDF</button><header><div><div class="brand">NODARA</div><div class="tag">SHIPMENT DOCUMENT CONTROL</div></div><div style="text-align:right"><div class="tag">${esc(doc.code)} · DRAFT R${issue.revision}</div><h1>${esc(doc.label)}</h1><b>${esc(s.shipment_number)}</b></div></header>${warning?`<div class="warn">${esc(warning)}</div>`:''}<div class="grid">${facts(s).map(([k,v])=>`<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div>${doc.terms?'<div class="terms"><b>Terms and conditions</b><br>Organization-approved terms must be configured before this document is issued. The shipment data and document revision are controlled separately from the terms template.</div>':''}<div class="sign"><div>Prepared / authorized by</div><div>Date / signature</div></div><div class="foot">Draft generated from NODARA · Document instance ${esc(issue.id)} · Review all carrier, security, dangerous-goods and jurisdiction-specific requirements before issue.</div></body></html>`);w.document.close()}

export async function mountShipmentDocumentStudio(host,s){
 const docs=SHIPMENT_DOCUMENT_CATALOG[s.mode]||SHIPMENT_DOCUMENT_CATALOG.GROUND;
 const [{data:issues},{data:compliance}]=await Promise.all([supabase.from('shipment_document_issues').select('*').eq('shipment_id',s.id).order('created_at',{ascending:false}),supabase.from('shipment_compliance_profiles').select('*').eq('shipment_id',s.id).maybeSingle()]);
 const latest=new Map();(issues||[]).forEach(x=>{if(!latest.has(x.document_code))latest.set(x.document_code,x)});
 host.innerHTML=`<div class="shipment-section-head"><div><h2>Document Studio</h2><p>Generate, version and control the formal document set from one shipment record.</p></div></div><div class="shipment-doc-control"><span>${esc(s.mode)} · ${docs.length} document types</span><span>DG: ${esc(compliance?.dangerous_goods_status||'NOT DECLARED')}</span><span>Battery: ${esc(compliance?.lithium_battery_status||'NOT DECLARED')}</span></div><div class="shipment-doc-grid">${docs.map(d=>{const x=latest.get(d.code);return `<article class="shipment-doc-card"><small>${esc(d.group)} · ${esc(d.scope)}</small><h3>${esc(d.label)}</h3><p>${d.carrier?'Carrier-controlled master: prepare data/working copy.':d.controlled?'Controlled compliance document.':'Generated from canonical shipment facts.'}</p><div><span>${x?esc(x.status)+' · R'+x.revision:'Not generated'}</span><button data-doc="${d.code}">${x?'New revision':'Generate draft'}</button></div></article>`}).join('')}</div>`;
 host.querySelectorAll('[data-doc]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=docs.find(x=>x.code===b.dataset.doc),x=await draft(d,s);printDoc(d,s,x);await mountShipmentDocumentStudio(host,s)}catch(e){alert(e.message)}finally{b.disabled=false}});
}
