import { supabase } from './supabase-client.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function reserve(title){
  const w=window.open('','_blank');
  if(!w)throw new Error('Pop-ups are blocked. Allow pop-ups for NODARA to open WR outputs.');
  w.document.open();
  w.document.write(`<html><head><title>${esc(title)}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px">Preparing…</body></html>`);
  w.document.close();
  return w;
}

async function context(wrId){
  const {data:wr,error}=await supabase.from('warehouse_receipts').select('*').eq('id',wrId).single();
  if(error)throw error;
  const [{data:job},{data:cargo},{data:parties},{data:visit},{data:locs},{data:refs}]=await Promise.all([
    supabase.from('jobs').select('*').eq('id',wr.job_id).single(),
    supabase.from('cargo_units').select('*').eq('job_id',wr.job_id).order('created_at'),
    supabase.from('warehouse_receipt_parties').select('*').eq('warehouse_receipt_id',wrId),
    supabase.from('warehouse_visits').select('*').eq('warehouse_receipt_id',wrId).eq('direction','inbound').order('created_at',{ascending:false}).limit(1),
    supabase.from('warehouse_locations').select('id,code,name'),
    supabase.from('shipment_references').select('*').eq('warehouse_receipt_id',wrId)
  ]);
  let customer=null;
  if(job?.customer_id){const r=await supabase.from('entities').select('id,name').eq('id',job.customer_id).maybeSingle();customer=r.data||null}
  return{wr,job,cargo:cargo||[],parties:parties||[],visit:visit?.[0]||null,locs:locs||[],refs:refs||[],customer};
}

const roots=rows=>rows.filter(x=>!x.parent_id&&!x.metadata?.editor_draft);
const party=(ctx,role)=>ctx.parties.find(x=>String(x.role||'').toUpperCase()===role)?.display_name||'—';
const loc=(ctx,row)=>ctx.locs.find(x=>x.id===(row.current_location_id||row.warehouse_location_id))?.code||'PENDING';
const fmt=v=>v?new Date(v).toLocaleString():'—';

function shell(title,body,printCss=''){
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#111;background:#fff}.tools{position:sticky;top:0;z-index:9;display:flex;gap:8px;padding:10px;background:#0b1220;color:#fff}.tools button{border:1px solid #36506b;border-radius:9px;background:#17385f;color:#fff;padding:9px 12px;font-weight:700}.page{padding:26px;max-width:900px;margin:auto}${printCss}@media print{.tools{display:none!important}.page{max-width:none;padding:0}}</style></head><body><div class="tools"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div>${body}</body></html>`;
}

function write(w,html){w.document.open();w.document.write(html);w.document.close()}

async function warehouseReceiptPDF(wrId){
  const w=reserve('Warehouse Receipt');
  try{
    const c=await context(wrId),v=c.visit||{},r=roots(c.cargo),ref=c.refs.map(x=>`${x.reference_type}: ${x.reference_value}`).join(' · ')||'—';
    const rows=r.map((x,i)=>`<tr><td>${esc(x.handling_unit_code||`HU ${i+1}`)}<small>${esc(x.package_type||'')}</small></td><td>${esc(x.description||x.part_number||x.sku||'—')}</td><td>${esc(`${x.quantity||0} ${x.uom||''}`)}</td><td>${x.weight_lb?esc(Number(x.weight_lb).toFixed(1)+' lb'):'—'}</td><td>${x.length_in&&x.width_in&&x.height_in?esc(`${x.length_in}×${x.width_in}×${x.height_in} in`):'—'}</td><td>${esc(loc(c,x))}</td></tr>`).join('');
    const body=`<main class="page"><header style="display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #111;padding-bottom:16px"><div><div style="font-size:11px;letter-spacing:.15em">NODARA · WAREHOUSE RECEIPT</div><h1 style="margin:5px 0 0;font-size:30px">${esc(c.wr.receipt_number)}</h1><div style="margin-top:6px;color:#555">${esc(String(c.wr.status||'').toUpperCase())}</div></div><div style="text-align:right"><b>${esc(c.customer?.name||'Unidentified customer')}</b><div>${esc(ref)}</div></div></header><section style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:20px 0"><div><small>CUSTOMER</small><h3>${esc(c.customer?.name||'Unidentified customer')}</h3><div>Shipper: ${esc(party(c,'SHIPPER'))}</div><div>Consignee: ${esc(party(c,'CONSIGNEE'))}</div></div><div><small>DOCK VISIT</small><div>Carrier: ${esc(v.carrier_name_snapshot||'—')}</div><div>Driver: ${esc(v.driver_name||'—')}</div><div>Time in: ${esc(fmt(v.time_in))}</div><div>Time out: ${esc(fmt(v.time_out))}</div></div></section><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>Handling unit</th><th>Description / part</th><th>Qty</th><th>Weight</th><th>Dimensions</th><th>Location</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No cargo recorded.</td></tr>'}</tbody></table><style>th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:10px;text-transform:uppercase}td small{display:block;color:#666;margin-top:3px}</style></main>`;
    write(w,shell(c.wr.receipt_number,body));
    return true;
  }catch(e){w.close();alert(e.message||'Could not create WR output.');return false}
}

async function labels4x6(wrId,ids=null){
  const w=reserve('4×6 Cargo Labels');
  try{
    const c=await context(wrId),r=roots(c.cargo).filter(x=>!ids||ids.includes(x.id));
    if(!r.length)throw new Error('There are no handling units to print.');
    const pages=r.map((x,i)=>`<section class="label"><header><b>NODARA</b><strong>${esc(c.wr.receipt_number)}</strong></header><div class="hu">${esc(x.handling_unit_code||`HU ${i+1}`)}</div><div class="cust">${esc(c.customer?.name||'UNIDENTIFIED')}</div><div class="box"><small>PACKAGE</small><b>${esc(`${x.quantity||0} ${x.uom||''} ${x.package_type||''}`)}</b></div><div class="box"><small>LOCATION</small><b>${esc(loc(c,x))}</b></div><div class="box wide"><small>DESCRIPTION / PART</small><b>${esc(x.description||x.part_number||x.sku||'—')}</b></div><footer><small>NODARA CARGO ID</small><b>${esc(x.handling_unit_code||x.uin||x.id)}</b></footer></section>`).join('');
    write(w,shell(`${c.wr.receipt_number} · 4×6`,`<div class="labels">${pages}</div>`,`@page{size:4in 6in;margin:0}.label{width:4in;height:6in;padding:.18in;page-break-after:always}.label header{display:flex;justify-content:space-between;border-bottom:4px solid #111;padding-bottom:.1in}.label header b{font-size:22pt}.label header strong{font-size:12pt}.hu{font-size:28pt;font-weight:900;margin-top:.16in}.cust{font-size:13pt;font-weight:700;margin:.06in 0 .18in}.box{border:2px solid #111;padding:.1in;margin-bottom:.09in}.box small,footer small{display:block;font-size:7pt}.box b{font-size:14pt}.wide{min-height:1.15in}footer{border-top:3px solid #111;margin-top:.16in;padding-top:.12in;word-break:break-all}`));
    return true;
  }catch(e){w.close();alert(e.message||'Could not create labels.');return false}
}

async function labels2x1(wrId,ids=null){
  const w=reserve('2×1 Cargo Labels');
  try{
    const c=await context(wrId),rows=c.cargo.filter(x=>(x.parent_id||x.part_number||x.sku)&&(!ids||ids.includes(x.id)));
    if(!rows.length)throw new Error('There are no content/part records to print.');
    const pages=rows.map(x=>`<section class="mini"><div><b>${esc(x.part_number||x.sku||x.package_type||'CONTENTS')}</b><span>${esc(c.wr.receipt_number)} · ${esc(`${x.quantity||0} ${x.uom||''}`)}</span><small>${esc(x.description||'')}</small></div><strong>${esc(x.handling_unit_code||x.id.slice(0,8))}</strong></section>`).join('');
    write(w,shell(`${c.wr.receipt_number} · 2×1`,`<div>${pages}</div>`,`@page{size:2in 1in;margin:0}.mini{width:2in;height:1in;padding:.06in;display:flex;justify-content:space-between;gap:.05in;page-break-after:always}.mini div{min-width:0}.mini b{font-size:9pt;display:block}.mini span,.mini small{font-size:6.5pt;display:block;margin-top:2px}.mini strong{font-size:6pt;writing-mode:vertical-rl;word-break:break-all}`));
    return true;
  }catch(e){w.close();alert(e.message||'Could not create labels.');return false}
}

window.NodaraWROutput={warehouseReceiptPDF,labels4x6,labels2x1};
export {warehouseReceiptPDF,labels4x6,labels2x1};
