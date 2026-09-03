import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const terminal=s=>['RELEASED','SHIPPED','DELETED','VOID','CANCELLED','DEPLETED'].includes(String(s||'').toUpperCase());
let enhancing=false,lastKey='';

async function releaseMapForCargo(cargoIds){
  if(!cargoIds.length)return new Map();
  const {data:lines,error}=await supabase.from('cargo_release_lines')
    .select('id,cargo_release_id,cargo_unit_id,requested_quantity,picked_quantity,pick_status,pick_exception,uom')
    .in('cargo_unit_id',cargoIds).limit(10000);
  if(error)throw error;
  const releaseIds=[...new Set((lines||[]).map(x=>x.cargo_release_id).filter(Boolean))];
  let releases=[];
  if(releaseIds.length){
    const {data,error:rerr}=await supabase.from('cargo_releases')
      .select('id,release_number,status,reference,scheduled_at,confirmed_at,driver_name,vehicle_reference')
      .in('id',releaseIds);
    if(rerr)throw rerr;
    releases=data||[];
  }
  const byRelease=new Map(releases.map(r=>[r.id,r])),byCargo=new Map();
  for(const l of lines||[]){
    const a=byCargo.get(l.cargo_unit_id)||[];
    a.push({...l,release:byRelease.get(l.cargo_release_id)||null});
    byCargo.set(l.cargo_unit_id,a);
  }
  return byCargo;
}

async function enhanceInventory(){
  const detail=main.querySelector('[data-ledger-node]');
  if(!detail||main.querySelector('#inventory-lineage-section'))return false;
  const ids=[...main.querySelectorAll('[data-ledger-node]')].map(x=>x.dataset.ledgerNode).filter(Boolean);
  if(!ids.length)return false;
  const [{data:cargo,error},releaseByCargo]=await Promise.all([
    supabase.from('cargo_units').select('id,job_id,parent_id,uin,handling_unit_code,package_type,quantity,uom,status,warehouse_location_id,part_number,sku').in('id',ids),
    releaseMapForCargo(ids)
  ]);
  if(error)throw error;
  const jobIds=[...new Set((cargo||[]).map(x=>x.job_id).filter(Boolean))];
  let wrByJob=new Map();
  if(jobIds.length){
    const {data:wrs}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number,status,created_at').in('job_id',jobIds);
    wrByJob=new Map((wrs||[]).map(w=>[w.job_id,w]));
  }
  const activeAlloc=[...releaseByCargo.values()].flat().filter(x=>x.release&&!['RELEASED','CANCELLED'].includes(String(x.release.status||'').toUpperCase()));
  const released=[...releaseByCargo.values()].flat().filter(x=>x.release?.status==='RELEASED');
  const sec=document.createElement('section');
  sec.className='record-section lifecycle-section';sec.id='inventory-lineage-section';
  sec.innerHTML=`<div class="section-heading"><div><div class="eyebrow">TRACEABILITY</div><h3>Warehouse lifecycle</h3><span class="muted">Source receipt → physical inventory → allocation → picking → release.</span></div><div class="lifecycle-kpis"><span><b>${activeAlloc.length}</b> active allocation${activeAlloc.length===1?'':'s'}</span><span><b>${released.length}</b> released movement${released.length===1?'':'s'}</span></div></div><div class="lifecycle-records">${(cargo||[]).map(c=>{const wr=wrByJob.get(c.job_id),rels=releaseByCargo.get(c.id)||[];return `<article class="lifecycle-record"><div class="lifecycle-record-head"><div><b>${esc(c.part_number||c.sku||c.uin||c.handling_unit_code||c.package_type||'Cargo')}</b><small>${esc(c.uin||c.handling_unit_code||c.package_type||'Physical inventory')} · ${Number(c.quantity||0)} ${esc(c.uom||'')}</small></div><span class="status-pill ${esc(c.status||'')}">${esc(c.status||'—')}</span></div><div class="lifecycle-path"><button ${wr?'data-life-wr="'+wr.id+'"':''} class="life-node ${wr?'done':''}"><span>1</span><div><small>RECEIVED</small><b>${esc(wr?.receipt_number||'No WR')}</b></div></button><div class="life-link"></div><div class="life-node done"><span>2</span><div><small>INVENTORY</small><b>${terminal(c.status)?'Departed':'On hand'}</b></div></div><div class="life-link"></div>${rels.length?`<div class="life-release-stack">${rels.map(x=>`<button class="life-node ${x.release?.status==='RELEASED'?'done':'active'}" data-life-cr="${x.release?.id||''}"><span>3</span><div><small>${esc(x.release?.status||'CR')}</small><b>${esc(x.release?.release_number||'Cargo Release')}</b><em>${Number(x.picked_quantity||0)}/${Number(x.requested_quantity||0)} ${esc(x.uom||c.uom||'')} picked</em></div></button>`).join('')}</div>`:`<div class="life-node"><span>3</span><div><small>OUTBOUND</small><b>Not allocated</b></div></div>`}</div></article>`}).join('')}</div>`;
  const existing=main.querySelector('.record-section');
  if(existing?.parentNode)existing.parentNode.appendChild(sec);else main.appendChild(sec);
  sec.querySelectorAll('[data-life-wr]').forEach(b=>b.onclick=()=>window.nodaraWROpen?.(b.dataset.lifeWr));
  sec.querySelectorAll('[data-life-cr]').forEach(b=>b.onclick=()=>window.nodaraCROpen?.(b.dataset.lifeCr));
  return true;
}

async function enhanceWR(){
  const recordNo=main.querySelector('.record-number')?.textContent?.trim();
  if(!recordNo||!/^WR-/i.test(recordNo)||main.querySelector('#wr-lifecycle-section'))return false;
  const {data:wr,error}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number,status,created_at,completed_at').eq('receipt_number',recordNo).maybeSingle();
  if(error||!wr)return false;
  const {data:cargo,error:ce}=await supabase.from('cargo_units').select('id,parent_id,quantity,uom,status,part_number,sku,uin,handling_unit_code,package_type').eq('job_id',wr.job_id).limit(10000);
  if(ce)throw ce;
  const ids=(cargo||[]).map(x=>x.id),releaseByCargo=await releaseMapForCargo(ids),allLinks=[...releaseByCargo.values()].flat(),releaseGroups=new Map();
  for(const x of allLinks){if(!x.release)continue;const g=releaseGroups.get(x.release.id)||{release:x.release,qty:0,picked:0,lines:0};g.qty+=Number(x.requested_quantity||0);g.picked+=Number(x.picked_quantity||0);g.lines++;releaseGroups.set(x.release.id,g)}
  const releases=[...releaseGroups.values()],active=releases.filter(x=>!['RELEASED','CANCELLED'].includes(String(x.release.status||'').toUpperCase())),released=releases.filter(x=>x.release.status==='RELEASED'),liveCargo=(cargo||[]).filter(x=>!terminal(x.status)&&Number(x.quantity||0)>0),top=(cargo||[]).filter(x=>!x.parent_id),topLive=top.filter(x=>!terminal(x.status)&&Number(x.quantity||0)>0);
  const sec=document.createElement('section');sec.className='record-section lifecycle-section';sec.id='wr-lifecycle-section';
  sec.innerHTML=`<div class="section-heading"><div><div class="eyebrow">LIFECYCLE</div><h3>Inventory & outbound activity</h3><span class="muted">Follow this receipt after receiving without leaving its record.</span></div></div><div class="wr-life-summary"><div><span>Received HUs</span><b>${top.length}</b><small>${topLive.length} still physically active</small></div><div><span>Inventory records</span><b>${liveCargo.length}</b><small>remaining in warehouse</small></div><div><span>Active CRs</span><b>${active.length}</b><small>allocated / picking / ready</small></div><div><span>Released CRs</span><b>${released.length}</b><small>completed outbound</small></div></div><div class="wr-life-flow"><span class="done">✓ Received</span><i></i><span class="${liveCargo.length?'active':'done'}">${liveCargo.length?'Inventory active':'✓ Inventory cleared'}</span><i></i><span class="${active.length?'active':released.length?'done':''}">${active.length?'Outbound in progress':released.length?'✓ Released':'No CR yet'}</span></div><div class="wr-outbound-list">${releases.length?releases.map(g=>`<button data-life-cr="${g.release.id}" class="wr-outbound-row"><div><span class="status-pill ${esc(g.release.status)}">${esc(g.release.status)}</span><b>${esc(g.release.release_number)}</b><small>${esc(g.release.reference||'No release reference')}</small></div><div><strong>${g.qty}</strong><small>release qty · ${g.picked} picked · ${g.lines} line${g.lines===1?'':'s'}</small></div><i>›</i></button>`).join(''):'<div class="empty compact">No Cargo Release has used inventory from this WR yet.</div>'}</div>`;
  const cargoSection=main.querySelector('#wr-cargo-section');
  if(cargoSection?.parentNode)cargoSection.insertAdjacentElement('afterend',sec);else main.appendChild(sec);
  sec.querySelectorAll('[data-life-cr]').forEach(b=>b.onclick=()=>window.nodaraCROpen?.(b.dataset.lifeCr));
  const activity=main.querySelector('#wr-tab-activity');
  if(activity){activity.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();sec.scrollIntoView({behavior:'smooth',block:'start'})},true)}
  return true;
}

async function enhance(){
  if(enhancing)return;enhancing=true;
  try{
    const key=(main.querySelector('.record-number')?.textContent||main.querySelector('.title')?.textContent||'')+'|'+main.querySelectorAll('[data-ledger-node]').length;
    if(key===lastKey&&main.querySelector('#inventory-lineage-section,#wr-lifecycle-section'))return;
    await enhanceInventory();await enhanceWR();lastKey=key;
  }catch(e){console.warn('Lifecycle lineage enhancement:',e)}finally{enhancing=false}
}
new MutationObserver(()=>requestAnimationFrame(enhance)).observe(main,{childList:true,subtree:true});
setTimeout(enhance,700);
window.nodaraRefreshWarehouseLineage=enhance;
