import { listCargo, getCargoNode, listCargoChildren, updateCargoNode, createCargoChild, deleteCargoSubtree } from './live-data.js';

export function createCargoExplorer({ main, shell, esc, packageTypes }) {
  let currentNode = null;

  async function list(search='') {
    shell('Cargo','Cargo.',`<p class="muted">Physical truth: every pallet, crate, box, bag, envelope, tote, unit and container.</p><div class="card"><div class="field"><label>Search anything</label><input id="cargo-search" value="${esc(search)}" placeholder="UIN, WR, SKU, part, lot, serial, location…"></div></div><div id="cargo-list"><p class="muted">Loading cargo…</p></div>`);
    const input=document.getElementById('cargo-search');
    input.onkeydown=e=>{if(e.key==='Enter')load(input.value)};
    input.oninput=()=>{clearTimeout(input._timer);input._timer=setTimeout(()=>load(input.value),250)};
    await load(search);
  }

  async function load(search='') {
    const out=document.getElementById('cargo-list'); if(!out)return;
    try {
      const rows=await listCargo(search);
      out.innerHTML=rows.length?rows.map(renderRow).join(''):`<div class="empty"><b>No cargo found.</b><p class="muted">Receive cargo or search another identifier.</p></div>`;
      out.querySelectorAll('[data-cargo-id]').forEach(b=>b.onclick=()=>open(b.dataset.cargoId));
    } catch(e){out.innerHTML=`<p class="warning">${esc(e.message)}</p>`}
  }

  function renderRow(n){
    const title=n.uin||n.handling_unit_code||`${n.package_type||'CARGO'}`;
    const refs=[n.job_number,n.job_reference,n.location_code].filter(Boolean).join(' · ');
    const item=n.part_number||n.sku||'';
    const dims=n.length_in!=null&&n.width_in!=null&&n.height_in!=null?`${Number(n.length_in)}×${Number(n.width_in)}×${Number(n.height_in)} in`:'';
    return `<button class="inventory-card" data-cargo-id="${n.id}" style="width:100%;text-align:left;margin-top:10px"><div><span class="eyebrow">${esc(n.package_type||'CARGO')}</span><b>${esc(title)}</b><span>${esc(n.description||item||'')}</span></div><div class="inventory-numbers"><strong>${Number(n.quantity||0)} ${esc(n.uom||'')}</strong><span>${esc(refs)}</span><small>${[n.weight_lb!=null?`${Number(n.weight_lb)} lb`:'',dims,n.status].filter(Boolean).map(esc).join(' · ')}</small></div></button>`;
  }

  async function open(id){
    shell('Cargo','Opening cargo…','<p class="muted">Loading physical record…</p>');
    try {
      const n=await getCargoNode(id); currentNode=n;
      const children=await listCargoChildren(id);
      const title=n.uin||n.handling_unit_code||n.package_type||'Cargo';
      shell(`Cargo · ${esc(n.package_type||'')}`,esc(title),`<div class="card"><div class="status"><span>Type</span><b>${esc(n.package_type||'—')}</b></div><div class="status"><span>Quantity</span><b>${Number(n.quantity||0)} ${esc(n.uom||'')}</b></div>${n.description?`<div class="status"><span>Description</span><b>${esc(n.description)}</b></div>`:''}${n.sku||n.part_number?`<div class="status"><span>Item</span><b>${esc(n.part_number||n.sku)}</b></div>`:''}<div class="status"><span>Status</span><b>${esc(n.status||'—')}</b></div><div class="status"><span>Location</span><b>${esc(n.location_code||'Unassigned')}</b></div>${n.weight_lb!=null?`<div class="status"><span>Weight</span><b>${Number(n.weight_lb)} lb</b></div>`:''}${n.length_in!=null&&n.width_in!=null&&n.height_in!=null?`<div class="status"><span>Dimensions</span><b>${Number(n.length_in)} × ${Number(n.width_in)} × ${Number(n.height_in)} in</b></div>`:''}${n.lot_number?`<div class="status"><span>Lot</span><b>${esc(n.lot_number)}</b></div>`:''}${n.serial_number?`<div class="status"><span>Serial</span><b>${esc(n.serial_number)}</b></div>`:''}${n.job_number?`<div class="status"><span>Job / WR context</span><b>${esc(n.job_number)}${n.job_reference?' · '+esc(n.job_reference):''}</b></div>`:''}</div><div class="grid2"><button class="actioncard" id="cargo-edit"><b>Edit</b><span>This exact level</span></button><button class="actioncard" id="cargo-add"><b>Add contained cargo</b><span>Child package or item</span></button></div><div class="eyebrow" style="margin-top:28px">Contents · ${children.length}</div><div id="cargo-children">${children.length?children.map(renderRow).join(''):'<div class="empty compact"><b>No contained cargo.</b></div>'}</div><button class="secondary wide" id="cargo-back">Back to Cargo</button>`);
      document.getElementById('cargo-edit').onclick=()=>edit(n);
      document.getElementById('cargo-add').onclick=()=>addChild(n);
      document.getElementById('cargo-back').onclick=()=>list();
      document.querySelectorAll('#cargo-children [data-cargo-id]').forEach(b=>b.onclick=()=>open(b.dataset.cargoId));
    } catch(e){shell('Cargo','Could not open cargo',`<p class="warning">${esc(e.message)}</p>`)}
  }

  function edit(n){
    shell('Cargo · Edit',esc(n.uin||n.handling_unit_code||n.package_type),`<p class="muted">This level has its own physical attributes. Editing it does not overwrite its parent or children.</p><div class="card"><div class="row"><div class="field"><label>Package type</label><select id="ce-type">${packageTypes.map(x=>`<option ${x===n.package_type?'selected':''}>${x}</option>`).join('')}<option ${n.package_type==='UNIT'?'selected':''}>UNIT</option></select></div><div class="field"><label>Quantity</label><input id="ce-qty" type="number" step="any" value="${esc(n.quantity??1)}"></div></div><div class="row"><div class="field"><label>UOM</label><input id="ce-uom" value="${esc(n.uom||'')}"></div><div class="field"><label>Weight lb</label><input id="ce-weight" type="number" step="any" value="${esc(n.weight_lb??'')}"></div></div><div class="field"><label>Description</label><input id="ce-desc" value="${esc(n.description||'')}"></div><div class="row"><div class="field"><label>Length in</label><input id="ce-l" type="number" step="any" value="${esc(n.length_in??'')}"></div><div class="field"><label>Width in</label><input id="ce-w" type="number" step="any" value="${esc(n.width_in??'')}"></div><div class="field"><label>Height in</label><input id="ce-h" type="number" step="any" value="${esc(n.height_in??'')}"></div></div><div class="row"><div class="field"><label>Lot</label><input id="ce-lot" value="${esc(n.lot_number||'')}"></div><div class="field"><label>Serial</label><input id="ce-serial" value="${esc(n.serial_number||'')}"></div></div><div class="field"><label>UIN</label><input id="ce-uin" value="${esc(n.uin||'')}"></div><div id="ce-status"></div><button class="primary wide" id="ce-save">Save</button><button class="secondary wide" id="ce-cancel">Cancel</button><button class="subtle wide" id="ce-delete">Delete this level + contents</button></div>`);
    document.getElementById('ce-save').onclick=async()=>{try{await updateCargoNode(n.id,{package_type:val('ce-type'),quantity:num('ce-qty'),uom:val('ce-uom'),description:val('ce-desc'),weight_lb:num('ce-weight'),length_in:num('ce-l'),width_in:num('ce-w'),height_in:num('ce-h'),lot_number:val('ce-lot'),serial_number:val('ce-serial'),uin:val('ce-uin')});await open(n.id)}catch(e){document.getElementById('ce-status').innerHTML=`<p class="warning">${esc(e.message)}</p>`}};
    document.getElementById('ce-cancel').onclick=()=>open(n.id);
    document.getElementById('ce-delete').onclick=async()=>{if(!confirm('Delete this cargo level and everything inside it?'))return;try{await deleteCargoSubtree(n.id);await list()}catch(e){document.getElementById('ce-status').innerHTML=`<p class="warning">${esc(e.message)}</p>`}};
  }

  function addChild(parent){
    shell('Cargo · Add','Contained cargo',`<p class="muted">Add a physical package or inventory item inside ${esc(parent.uin||parent.package_type)}.</p><div class="card"><div class="row"><div class="field"><label>Type</label><select id="ca-type">${packageTypes.map(x=>`<option>${x}</option>`).join('')}<option>UNIT</option></select></div><div class="field"><label>Qty</label><input id="ca-qty" type="number" step="any" value="1"></div></div><div class="row"><div class="field"><label>SKU</label><input id="ca-sku"></div><div class="field"><label>Part number</label><input id="ca-part"></div></div><div class="field"><label>Description</label><input id="ca-desc"></div><div class="row"><div class="field"><label>Weight lb</label><input id="ca-weight" type="number" step="any"></div><div class="field"><label>L</label><input id="ca-l" type="number" step="any"></div><div class="field"><label>W</label><input id="ca-w" type="number" step="any"></div><div class="field"><label>H</label><input id="ca-h" type="number" step="any"></div></div><div class="row"><div class="field"><label>Lot</label><input id="ca-lot"></div><div class="field"><label>Serial</label><input id="ca-serial"></div></div><div id="ca-status"></div><button class="primary wide" id="ca-save">Add inside</button><button class="secondary wide" id="ca-cancel">Cancel</button></div>`);
    document.getElementById('ca-save').onclick=async()=>{try{await createCargoChild(parent.id,{package_type:val('ca-type'),quantity:num('ca-qty')||1,sku:val('ca-sku'),part_number:val('ca-part'),description:val('ca-desc'),weight_lb:num('ca-weight'),length_in:num('ca-l'),width_in:num('ca-w'),height_in:num('ca-h'),lot_number:val('ca-lot'),serial_number:val('ca-serial')});await open(parent.id)}catch(e){document.getElementById('ca-status').innerHTML=`<p class="warning">${esc(e.message)}</p>`}};
    document.getElementById('ca-cancel').onclick=()=>open(parent.id);
  }

  function val(id){return document.getElementById(id)?.value?.trim?.()??document.getElementById(id)?.value??''}
  function num(id){const v=document.getElementById(id)?.value;return v===''||v==null?null:Number(v)}
  return { list, open };
}
