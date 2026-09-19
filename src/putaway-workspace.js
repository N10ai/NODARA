import { supabase } from './supabase-client.js';
const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected=null;
async function load(){
  const {data,error}=await supabase.from('cargo_units').select('id,parent_id,package_type,quantity,uom,description,status,sku,part_number,uin,handling_unit_code,warehouse_location_id,created_at').is('parent_id',null).not('status','in','("RELEASED","SHIPPED","DELETED","CANCELLED","VOID")').order('created_at',{ascending:false}).limit(500);
  if(error)throw error; return data||[];
}
function label(x){return x.uin||x.handling_unit_code||x.part_number||x.sku||x.description||x.package_type||'Cargo'}
function row(x){return `<button class="record putaway-row" data-putaway-cargo="${x.id}"><div><b>${esc(label(x))}</b><small>${esc([x.package_type,x.description].filter(Boolean).join(' · '))}</small></div><div><b>${Number(x.quantity||0)} ${esc(x.uom||'')}</b><small>${x.warehouse_location_id?'Located':'Needs location'}</small></div><i>›</i></button>`}
async function open(){
  window.nodaraSetActive?.('warehouse_putaway');
  main.innerHTML='<div class="eyebrow">Warehouse · Putaway</div><h1 class="title">Putaway</h1><p class="muted">Loading cargo ready for location assignment…</p>';
  try{
    const rows=await load(),pending=rows.filter(x=>!x.warehouse_location_id),located=rows.filter(x=>x.warehouse_location_id);
    main.innerHTML=`<div class="record-commandbar"><button class="secondary compact-btn" data-putaway-back>‹ Warehouse</button></div><div class="eyebrow">Warehouse · Putaway</div><h1 class="title">Putaway</h1><p class="muted">Scan or select physical cargo, then scan or search its destination. Putaway uses the same location movement ledger as inventory moves.</p><div class="inventory-kpi-grid"><div><span>Needs location</span><strong>${pending.length}</strong><small>top-level handling units</small></div><div><span>Located</span><strong>${located.length}</strong><small>available handling units</small></div></div><div class="inventory-actionbar"><div><b>Ready for putaway</b><small>Unlocated cargo appears first.</small></div><div class="inventory-searchbox"><span>⌕</span><input data-putaway-search placeholder="Scan or search cargo…"></div></div><div data-putaway-list>${pending.length?pending.map(row).join(''):'<div class="empty compact">No unlocated cargo. Search to relocate existing cargo.</div>'}</div>`;
    const list=main.querySelector('[data-putaway-list]'),input=main.querySelector('[data-putaway-search]');
    const render=q=>{q=q.trim().toLowerCase();const found=!q?pending:rows.filter(x=>[label(x),x.package_type,x.description,x.part_number,x.sku,x.uin,x.handling_unit_code].some(v=>String(v||'').toLowerCase().includes(q)));list.innerHTML=found.length?found.map(row).join(''):'<div class="empty compact">No cargo matches.</div>';bind()};
    function bind(){list.querySelectorAll('[data-putaway-cargo]').forEach(b=>b.onclick=()=>destination(rows.find(x=>x.id===b.dataset.putawayCargo)))}
    bind();input.oninput=e=>render(e.target.value);main.querySelector('[data-putaway-back]').onclick=()=>window.nodaraGo?.('warehouse_dashboard');
  }catch(e){main.innerHTML=`<div class="eyebrow">Warehouse · Putaway</div><h1 class="title">Putaway could not load</h1><p class="warning">${esc(e.message)}</p>`}
}
async function destination(cargo){
  selected=cargo;
  main.innerHTML=`<div class="record-commandbar"><button class="secondary compact-btn" data-putaway-back>‹ Putaway</button></div><div class="eyebrow">Putaway · Destination</div><h1 class="title">${esc(label(cargo))}</h1><p class="muted">${Number(cargo.quantity||0)} ${esc(cargo.uom||'')} · ${esc(cargo.package_type||'Cargo')}</p><div class="card"><div class="field"><label>Destination location</label><input data-cargo-location data-cargo-type="${esc(cargo.package_type||'')}" data-cargo-qty="${Number(cargo.quantity||1)}" placeholder="Scan or search location…" autocomplete="off"></div><div class="field"><label>Movement note</label><input data-putaway-note placeholder="Optional reference or note"></div><div data-putaway-status></div><button class="primary wide" data-putaway-confirm disabled>Confirm putaway</button></div>`;
  const input=main.querySelector('[data-cargo-location]'),btn=main.querySelector('[data-putaway-confirm]'),status=main.querySelector('[data-putaway-status]');
  const sync=()=>btn.disabled=!input.dataset.locationId;input.addEventListener('input',sync);input.addEventListener('change',sync);main.querySelector('[data-putaway-back]').onclick=open;
  btn.onclick=async()=>{if(!input.dataset.locationId)return;btn.disabled=true;btn.textContent='Putting away…';try{const{error}=await supabase.rpc('move_cargo_location_atomic',{p_cargo_unit_id:cargo.id,p_to_location_id:input.dataset.locationId,p_movement_type:cargo.warehouse_location_id?'MOVE':'PUTAWAY',p_reference_type:'PUTAWAY',p_reference_id:null,p_notes:main.querySelector('[data-putaway-note]').value||null});if(error)throw error;window.nodaraRefreshLocations?.();status.innerHTML='<div class="notice ok"><b>Putaway complete.</b> Location and movement history updated.</div>';setTimeout(open,650)}catch(e){btn.disabled=false;btn.textContent='Confirm putaway';status.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`}}
}
window.nodaraPutaway={open};
