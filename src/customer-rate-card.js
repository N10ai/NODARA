import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c='USD')=>v==null||v===''?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:c||'USD'}).format(Number(v));
let cache=null,activeFilter='ALL';

async function loadEffective(customerId){
  const org=await getCurrentOrganizationId();
  const [c,s,r,a]=await Promise.all([
    supabase.from('entities').select('id,name,code').eq('id',customerId).single(),
    supabase.from('service_catalog').select('*').eq('organization_id',org).eq('active',true).order('domain').order('name'),
    supabase.from('standard_rates').select('*').eq('organization_id',org).eq('active',true).order('effective_from',{ascending:false}),
    supabase.from('customer_rate_agreements').select('*').eq('organization_id',org).eq('customer_id',customerId).eq('active',true).order('effective_from',{ascending:false})
  ]);
  for(const x of[c,s,r,a]) if(x.error) throw x.error;
  const stdBy=new Map(); for(const x of r.data||[]) if(!stdBy.has(x.service_id)) stdBy.set(x.service_id,x);
  const agrBy=new Map(); for(const x of a.data||[]) if(!agrBy.has(x.service_id)) agrBy.set(x.service_id,x);
  const rows=(s.data||[]).map(service=>{
    const agr=agrBy.get(service.id),std=stdBy.get(service.id),rate=agr||std;
    if(!rate) return null;
    return {service,rate,source:agr?'CUSTOMER':'STANDARD'};
  }).filter(Boolean);
  cache={customer:c.data,rows};return cache;
}

function counts(rows){return {all:rows.length,custom:rows.filter(x=>x.source==='CUSTOMER').length,standard:rows.filter(x=>x.source==='STANDARD').length}}
function installSummary(){
  const sel=document.getElementById('rate-customer'); if(!sel||!sel.value) return;
  if(document.getElementById('customer-rate-card-tools')) return;
  const bar=sel.closest('.rate-customer-bar'); if(!bar) return;
  const box=document.createElement('section');box.id='customer-rate-card-tools';box.className='customer-rate-card-tools';box.innerHTML='<div class="muted">Loading effective customer rates…</div>';bar.insertAdjacentElement('afterend',box);
  refreshSummary(sel.value).catch(e=>box.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`);
}
async function refreshSummary(customerId){
  const box=document.getElementById('customer-rate-card-tools'); if(!box) return;
  const data=await loadEffective(customerId),n=counts(data.rows);
  box.innerHTML=`<div class="customer-rate-card-head"><div><div class="eyebrow">Effective Customer Rate Card</div><h3>${esc(data.customer?.name||'Customer')}</h3><small>What NODARA will actually use after customer overrides and standard-rate fallback.</small></div><button class="primary compact-btn" id="customer-rate-pdf">Print / PDF Rate Sheet</button></div><div class="customer-rate-kpis"><button data-crf="ALL" class="${activeFilter==='ALL'?'active':''}"><span>Effective services</span><b>${n.all}</b></button><button data-crf="CUSTOMER" class="${activeFilter==='CUSTOMER'?'active':''}"><span>Customer overrides</span><b>${n.custom}</b></button><button data-crf="STANDARD" class="${activeFilter==='STANDARD'?'active':''}"><span>Standard inherited</span><b>${n.standard}</b></button></div>`;
  box.querySelectorAll('[data-crf]').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.crf;box.querySelectorAll('[data-crf]').forEach(x=>x.classList.toggle('active',x.dataset.crf===activeFilter));filterVisibleRows()});
  document.getElementById('customer-rate-pdf').onclick=printRateSheet;
  annotateVisibleRows();filterVisibleRows();
}
function annotateVisibleRows(){
  document.querySelectorAll('.rate-row').forEach(row=>{
    const source=row.querySelector('.rate-source')?.textContent?.toLowerCase().includes('customer')?'CUSTOMER':'STANDARD';
    row.dataset.effectiveSource=source;
    const src=row.querySelector('.rate-source');if(src){src.textContent=source==='CUSTOMER'?'Customer Override':'Standard Inherited';src.classList.toggle('custom',source==='CUSTOMER')}
  });
}
function filterVisibleRows(){document.querySelectorAll('.rate-row').forEach(r=>r.style.display=activeFilter==='ALL'||r.dataset.effectiveSource===activeFilter?'':'none')}
function groupHtml(rows){
  const domains=[...new Set(rows.map(x=>x.service.domain))];
  return domains.map(domain=>{
    const rs=rows.filter(x=>x.service.domain===domain);
    return `<section class="pdf-domain"><h2>${esc(domain)}</h2><table><thead><tr><th>Service</th><th>Billing Unit</th><th>Rate</th><th>Minimum</th><th>Source</th><th>Effective</th></tr></thead><tbody>${rs.map(x=>`<tr><td><b>${esc(x.service.name)}</b>${x.service.description?`<small>${esc(x.service.description)}</small>`:''}</td><td>${esc(x.rate.unit||x.service.default_unit||'EA')}</td><td>${money(x.rate.sell_rate,x.rate.currency)}</td><td>${money(x.rate.minimum_charge,x.rate.currency)}</td><td>${x.source==='CUSTOMER'?'Customer':'Standard'}</td><td>${esc(x.rate.effective_from||'—')}${x.rate.effective_to?` – ${esc(x.rate.effective_to)}`:''}</td></tr>`).join('')}</tbody></table></section>`;
  }).join('');
}
async function printRateSheet(){
  const sel=document.getElementById('rate-customer'); if(!sel?.value) return alert('Choose a customer first.');
  const data=cache?.customer?.id===sel.value?cache:await loadEffective(sel.value);
  const w=window.open('','_blank'); if(!w) return alert('Allow pop-ups to generate the rate sheet.');
  const today=new Date().toLocaleDateString();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.customer?.name||'Customer')} Rate Sheet</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:24px}.brand{font-size:18px;font-weight:800;letter-spacing:.16em}.muted{color:#666;font-size:12px}.pdf-domain{margin:24px 0;break-inside:avoid}.pdf-domain h2{font-size:13px;letter-spacing:.08em;margin:0 0 8px}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#f3f4f6;padding:8px;border-bottom:1px solid #ccc}td{padding:9px 8px;border-bottom:1px solid #ddd;vertical-align:top}td small{display:block;color:#666;margin-top:3px}.foot{margin-top:28px;font-size:10px;color:#666;border-top:1px solid #ddd;padding-top:10px}@media print{body{margin:18mm}.pdf-domain{break-inside:auto}thead{display:table-header-group}}</style></head><body><div class="head"><div><div class="brand">NODARA°</div><h1>Customer Rate Sheet</h1><div><b>${esc(data.customer?.name||'Customer')}</b>${data.customer?.code?` · ${esc(data.customer.code)}`:''}</div></div><div class="muted">Generated ${esc(today)}<br>Effective rates shown include customer overrides and standard-rate fallback.</div></div>${groupHtml(data.rows)}<div class="foot">Rates are subject to the applicable service terms, minimums, effective dates and any approved exceptions. This sheet reflects the effective rates configured in NODARA at the time generated.</div><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);w.document.close();
}

function enhance(){
  if(window.__nodaraRoute!=='pricing_rates') return;
  const mode=[...document.querySelectorAll('[data-rate-mode]')].find(b=>b.classList.contains('active'))?.dataset.rateMode;
  if(mode!=='customer') return;
  installSummary();
  const sel=document.getElementById('rate-customer');if(sel&&!sel.dataset.rateCardBound){sel.dataset.rateCardBound='1';sel.addEventListener('change',()=>setTimeout(()=>{document.getElementById('customer-rate-card-tools')?.remove();cache=null;activeFilter='ALL';installSummary()},50))}
}
const obs=new MutationObserver(()=>setTimeout(enhance,0));obs.observe(document.body,{childList:true,subtree:true});setTimeout(enhance,500);
