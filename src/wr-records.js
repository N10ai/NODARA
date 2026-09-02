import { supabase } from './supabase-client.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main=document.getElementById('main');
const shell=(eye,title,body)=>{main.innerHTML=`<div class="eyebrow">${eye}</div><h1 class="title">${title}</h1>${body}`};
const fmtDate=v=>v?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(v)):'—';

async function getReceipts(){
  const {data:receipts,error}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number,status,started_at,completed_at,notes,created_at,jobs(id,job_number,reference,description,customer_id)').order('created_at',{ascending:false}).limit(250);
  if(error)throw error;
  const rows=receipts||[];
  const customerIds=[...new Set(rows.map(r=>r.jobs?.customer_id).filter(Boolean))];
  const jobIds=[...new Set(rows.map(r=>r.job_id).filter(Boolean))];
  const receiptIds=rows.map(r=>r.id);
  const [entitiesRes,refsRes,cargoRes]=await Promise.all([
    customerIds.length?supabase.from('entities').select('id,name,code').in('id',customerIds):Promise.resolve({data:[],error:null}),
    receiptIds.length?supabase.from('shipment_references').select('warehouse_receipt_id,reference_type,reference_value,is_primary').in('warehouse_receipt_id',receiptIds):Promise.resolve({data:[],error:null}),
    jobIds.length?supabase.from('cargo_units').select('job_id,id,parent_id,package_type,quantity,uom,weight_lb').in('job_id',jobIds).is('parent_id',null):Promise.resolve({data:[],error:null})
  ]);
  if(entitiesRes.error)throw entitiesRes.error;if(refsRes.error)throw refsRes.error;if(cargoRes.error)throw cargoRes.error;
  const entities=new Map((entitiesRes.data||[]).map(x=>[x.id,x]));
  const refsBy=new Map();for(const r of refsRes.data||[]){if(!refsBy.has(r.warehouse_receipt_id))refsBy.set(r.warehouse_receipt_id,[]);refsBy.get(r.warehouse_receipt_id).push(r)}
  const cargoBy=new Map();for(const c of cargoRes.data||[]){if(!cargoBy.has(c.job_id))cargoBy.set(c.job_id,[]);cargoBy.get(c.job_id).push(c)}
  return rows.map(r=>({...r,customer:entities.get(r.jobs?.customer_id)||null,references:refsBy.get(r.id)||[],topCargo:cargoBy.get(r.job_id)||[]}));
}

function cargoSummary(rows){
  if(!rows?.length)return 'No cargo';
  const by={};for(const r of rows){const t=r.package_type||'Cargo';by[t]=(by[t]||0)+Number(r.quantity||0)}
  return Object.entries(by).map(([k,v])=>`${v} ${k}`).join(' · ');
}
function primaryRef(r){const p=r.references.find(x=>x.is_primary)||r.references[0];return p?`${p.reference_type}: ${p.reference_value}`:(r.jobs?.reference||'—')}

export async function warehouseReceiptList(){
  shell('Warehouse','Warehouse Receipts',`<div class="view-toolbar"><div class="table-search"><span class="nav-icon">⌕</span><input id="wr-table-search" placeholder="Search WR, customer, reference…"></div><button class="primary compact-btn" id="wr-create-new">＋ New Receipt</button></div><div id="wr-table-wrap"><p class="muted">Loading saved receipts…</p></div>`);
  document.getElementById('wr-create-new').onclick=()=>window.nodaraReceive?.();
  try{
    const rows=await getReceipts();
    render(rows);
    document.getElementById('wr-table-search').oninput=e=>{const q=e.target.value.trim().toLowerCase();render(!q?rows:rows.filter(r=>[r.receipt_number,r.customer?.name,r.jobs?.reference,r.jobs?.description,...r.references.map(x=>x.reference_value)].filter(Boolean).some(v=>String(v).toLowerCase().includes(q))))};
  }catch(e){document.getElementById('wr-table-wrap').innerHTML=`<div class="notice warning">${esc(e.message)}</div>`}
}

function render(rows){
  const wrap=document.getElementById('wr-table-wrap');if(!wrap)return;
  if(!rows.length){wrap.innerHTML='<div class="empty"><b>No warehouse receipts yet.</b><p>Create the first receipt to start the operational record list.</p></div>';return}
  wrap.innerHTML=`<div class="data-table"><div class="data-row data-head"><div>WR #</div><div>Customer</div><div>Reference</div><div>Cargo</div><div>Status</div><div>Date</div><div></div></div>${rows.map(r=>`<button class="data-row" data-wr-id="${r.id}"><div data-label="WR #"><b>${esc(r.receipt_number)}</b><small>${esc(r.jobs?.job_number||'')}</small></div><div data-label="Customer">${esc(r.customer?.name||'Warehouse / Unassigned')}</div><div data-label="Reference">${esc(primaryRef(r))}</div><div data-label="Cargo">${esc(cargoSummary(r.topCargo))}</div><div data-label="Status"><span class="status-pill ${esc(r.status)}">${esc(r.status)}</span></div><div data-label="Date">${esc(fmtDate(r.created_at))}</div><div class="row-chevron">›</div></button>`).join('')}</div>`;
  wrap.querySelectorAll('[data-wr-id]').forEach(b=>b.onclick=()=>warehouseReceiptDetail(b.dataset.wrId));
}

export async function warehouseReceiptDetail(id){
  shell('Warehouse Receipt','Loading…','<p class="muted">Opening saved record.</p>');
  try{
    const rows=await getReceipts();const r=rows.find(x=>x.id===id);if(!r)throw new Error('Warehouse receipt not found');
    const {data:cargo,error}=await supabase.from('cargo_units').select('id,parent_id,uin,handling_unit_code,package_type,quantity,uom,description,weight_lb,length_in,width_in,height_in,status,sku,part_number,serial_number,lot_number').eq('job_id',r.job_id).order('created_at');if(error)throw error;
    const top=(cargo||[]).filter(x=>!x.parent_id);
    shell('Warehouse Receipt',esc(r.receipt_number),`<div class="record-commandbar"><button class="secondary compact-btn" id="wr-back">‹ Receipts</button><button class="secondary compact-btn" id="wr-new-from-detail">＋ New</button></div><div class="record-header"><div><span class="status-pill ${esc(r.status)}">${esc(r.status)}</span><h2>${esc(r.customer?.name||'Warehouse / Unassigned')}</h2><p>${esc(r.jobs?.description||'No description')}</p></div><div class="record-number">${esc(r.receipt_number)}</div></div><div class="record-tabs"><button class="active">Overview</button><button id="wr-tab-cargo">Cargo <span>${cargo?.length||0}</span></button><button>Documents</button><button>Activity</button><button>Charges</button></div><section class="record-section"><h3>Receipt</h3><div class="detail-grid"><div><span>Job</span><b>${esc(r.jobs?.job_number||'—')}</b></div><div><span>Received</span><b>${esc(fmtDate(r.created_at))}</b></div><div><span>Primary reference</span><b>${esc(primaryRef(r))}</b></div><div><span>Status</span><b>${esc(r.status)}</b></div></div></section><section class="record-section"><div class="section-heading"><h3>References</h3></div>${r.references.length?r.references.map(x=>`<div class="line-item"><span>${esc(x.reference_type)}</span><b>${esc(x.reference_value)}</b></div>`).join(''):'<div class="empty compact">No references saved.</div>'}</section><section class="record-section"><div class="section-heading"><h3>Cargo</h3><span>${top.length} top-level piece${top.length===1?'':'s'}</span></div>${top.length?top.map(x=>`<button class="line-item clickable" data-open-cargo="${x.id}"><span><b>${esc(x.package_type||'Cargo')}</b><small>${esc(x.uin||x.handling_unit_code||'')}</small></span><b>${Number(x.quantity||0)} ${esc(x.uom||'')}</b><i>›</i></button>`).join(''):'<div class="empty compact">No cargo attached.</div>'}</section>`);
    document.getElementById('wr-back').onclick=warehouseReceiptList;document.getElementById('wr-new-from-detail').onclick=()=>window.nodaraReceive?.();
    document.querySelectorAll('[data-open-cargo]').forEach(b=>b.onclick=()=>window.nodaraOpenCargo?.(b.dataset.openCargo));
    document.getElementById('wr-tab-cargo').onclick=()=>document.querySelector('[data-open-cargo]')?.scrollIntoView({behavior:'smooth'});
  }catch(e){shell('Warehouse Receipt','Could not open record',`<div class="notice warning">${esc(e.message)}</div><button class="secondary wide" onclick="window.nodaraWRList()">Back</button>`)}
}

window.nodaraWRList=warehouseReceiptList;
window.nodaraWROpen=warehouseReceiptDetail;
