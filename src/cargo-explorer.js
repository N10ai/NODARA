import { listCargo, getCargoNode, listCargoChildren, updateCargoNode, createCargoChild, deleteCargoSubtree, listSavedItems, listLocations } from './live-data.js';

export function createCargoExplorer({ main, shell, esc, packageTypes }) {
  let currentNode=null;
  const UOMS=['EA','PCS','BOX','CTN','PLT','KG','LB','SET','ROLL','BAG'];
  const STATUSES=['received','stored','on_hold','allocated','picked','exception'];
  const packageChoices=[...packageTypes,'UNIT'];

  async function list(search=''){
    shell('Cargo','Cargo.',`<p class="muted">Physical cargo. Open any level to inspect or act on it.</p><div class="card"><div class="field"><label>Search</label><input id="cargo-search" value="${esc(search)}" placeholder="UIN, WR, SKU, lot, serial, location…"></div></div><div id="cargo-list"><p class="muted">Loading…</p></div>`);
    const i=document.getElementById('cargo-search'); i.oninput=()=>{clearTimeout(i._t);i._t=setTimeout(()=>load(i.value),220)}; await load(search);
  }
  async function load(search=''){
    const out=document.getElementById('cargo-list'); if(!out)return;
    try{const rows=await listCargo(search);out.innerHTML=rows.length?rows.map(renderRow).join(''):'<div class="empty"><b>No cargo found.</b></div>';out.querySelectorAll('[data-cargo-id]').forEach(b=>b.onclick=()=>open(b.dataset.cargoId));}catch(e){out.innerHTML=`<p class="warning">${esc(e.message)}</p>`}
  }
  function renderRow(n){const title=n.uin||n.handling_unit_code||n.package_type||'Cargo';const sub=[n.part_number||n.sku,n.description,n.location_code].filter(Boolean).join(' · ');return `<button class="inventory-card" data-cargo-id="${n.id}" style="width:100%;text-align:left;margin-top:10px"><div><span class="eyebrow">${esc(n.package_type||'CARGO')}</span><b>${esc(title)}</b><span>${esc(sub)}</span></div><div class="inventory-numbers"><strong>${Number(n.quantity||0)} ${esc(n.uom||'')}</strong><span>${esc(n.status||'')}</span></div></button>`}

  async function open(id){
    shell('Cargo','Opening…','<p class="muted">Loading record…</p>');
    try{const n=await getCargoNode(id);currentNode=n;const children=await listCargoChildren(id);const title=n.uin||n.handling_unit_code||n.package_type||'Cargo';
      shell(`Cargo · ${esc(n.package_type||'')}`,esc(title),`<div class="card"><div class="eyebrow">You are viewing</div><h2 style="margin:8px 0 4px">${esc(n.package_type||'Cargo')} · ${Number(n.quantity||0)} ${esc(n.uom||'')}</h2><p class="muted">${esc(n.description||n.part_number||n.sku||'No description')}</p><div class="chips">${n.location_code?`<span class="chip">${esc(n.location_code)}</span>`:''}<span class="chip">${esc(n.status||'')}</span>${n.weight_lb!=null?`<span class="chip">${Number(n.weight_lb)} lb</span>`:''}${dims(n)?`<span class="chip">${dims(n)}</span>`:''}</div></div><div class="grid2"><button class="actioncard" id="cargo-edit"><b>Edit details</b><span>Guided choices</span></button><button class="actioncard" id="cargo-add"><b>Add inside</b><span>Package or saved item</span></button></div><div class="eyebrow" style="margin-top:28px">Contents · ${children.length}</div><div id="cargo-children">${children.length?children.map(renderRow).join(''):'<div class="empty compact"><b>No contained cargo.</b></div>'}</div><button class="secondary wide" id="cargo-back">Back to Cargo</button>`);
      document.getElementById('cargo-edit').onclick=()=>edit(n);document.getElementById('cargo-add').onclick=()=>addChild(n);document.getElementById('cargo-back').onclick=()=>list();document.querySelectorAll('#cargo-children [data-cargo-id]').forEach(b=>b.onclick=()=>open(b.dataset.cargoId));
    }catch(e){shell('Cargo','Could not open cargo',`<p class="warning">${esc(e.message)}</p>`)}
  }

  async function edit(n){
    const [locations,items]=await Promise.all([listLocations(),listSavedItems()]);
    const title=n.uin||n.handling_unit_code||n.package_type;
    shell('Cargo · Edit',esc(title),`<div class="card"><div class="eyebrow">Editing this exact level</div><h2>${esc(n.package_type||'Cargo')} · ${Number(n.quantity||0)} ${esc(n.uom||'')}</h2><p class="muted">Parent and contained cargo stay unchanged.</p></div>
      ${section('What is it?',choiceGrid('ce-type',packageChoices,n.package_type))}
      ${section('Quantity & unit',`<div class="row"><div class="field"><label>Quantity</label><input id="ce-qty" type="number" step="any" value="${esc(n.quantity??1)}"></div><div class="field"><label>Unit</label><select id="ce-uom">${UOMS.map(x=>`<option ${x===n.uom?'selected':''}>${x}</option>`).join('')}<option ${!UOMS.includes(n.uom)?'selected':''}>${esc(n.uom||'OTHER')}</option></select></div></div>`)}
      ${section('Status',choiceGrid('ce-status-choice',STATUSES,n.status))}
      ${section('Location',`<select id="ce-location"><option value="">Unassigned</option>${locations.map(x=>`<option value="${x.id}" ${x.id===n.current_location_id?'selected':''}>${esc(x.code)}${x.zone?' · '+esc(x.zone):''}</option>`).join('')}</select>`)}
      ${section('Item / description',`<select id="ce-item"><option value="">No saved item</option>${items.map(x=>`<option value="${x.id}" data-sku="${esc(x.sku||'')}" data-part="${esc(x.part_number||'')}" data-desc="${esc(x.description||'')}" ${x.id===n.inventory_item_id?'selected':''}>${esc(x.part_number||x.sku||x.description||'Item')}</option>`).join('')}</select><div class="field"><label>Description</label><input id="ce-desc" value="${esc(n.description||'')}"></div>`)}
      ${section('Physical details',`<div class="row"><div class="field"><label>Weight lb</label><input id="ce-weight" type="number" step="any" value="${esc(n.weight_lb??'')}"></div><div class="field"><label>L</label><input id="ce-l" type="number" step="any" value="${esc(n.length_in??'')}"></div><div class="field"><label>W</label><input id="ce-w" type="number" step="any" value="${esc(n.width_in??'')}"></div><div class="field"><label>H</label><input id="ce-h" type="number" step="any" value="${esc(n.height_in??'')}"></div></div>`)}
      ${section('Traceability',`<div class="row"><div class="field"><label>Lot</label><input id="ce-lot" value="${esc(n.lot_number||'')}"></div><div class="field"><label>Serial</label><input id="ce-serial" value="${esc(n.serial_number||'')}"></div></div><div class="field"><label>UIN</label><input id="ce-uin" value="${esc(n.uin||'')}"></div>`)}
      <div id="ce-msg"></div><button class="primary wide" id="ce-save">Save changes</button><button class="secondary wide" id="ce-cancel">Cancel</button><button class="subtle wide" id="ce-delete">Delete this level + contents</button>`);
    bindChoiceGroup('ce-type');bindChoiceGroup('ce-status-choice');
    document.getElementById('ce-item').onchange=e=>{const o=e.target.selectedOptions[0];if(o?.dataset.desc&&!document.getElementById('ce-desc').value)document.getElementById('ce-desc').value=o.dataset.desc};
    document.getElementById('ce-save').onclick=async()=>{try{await updateCargoNode(n.id,{package_type:selectedChoice('ce-type')||n.package_type,quantity:num('ce-qty'),uom:val('ce-uom'),description:val('ce-desc'),weight_lb:num('ce-weight'),length_in:num('ce-l'),width_in:num('ce-w'),height_in:num('ce-h'),lot_number:val('ce-lot'),serial_number:val('ce-serial'),uin:val('ce-uin'),status:selectedChoice('ce-status-choice')||n.status,location_id:val('ce-location')||null});await open(n.id)}catch(e){msg('ce-msg',e)}};
    document.getElementById('ce-cancel').onclick=()=>open(n.id);document.getElementById('ce-delete').onclick=async()=>{if(!confirm('Delete this cargo level and everything inside it?'))return;try{await deleteCargoSubtree(n.id);await list()}catch(e){msg('ce-msg',e)}};
  }

  async function addChild(parent){
    const [items,locations]=await Promise.all([listSavedItems(),listLocations()]);
    shell('Cargo · Add','What are you adding?',`<div class="card"><div class="eyebrow">Inside</div><h2>${esc(parent.uin||parent.package_type)}</h2><p class="muted">Choose a saved item or a package type first. Manual entry is secondary.</p></div>
      ${section('1 · Choose kind',choiceGrid('ca-kind',['SAVED ITEM','PACKAGE'],'SAVED ITEM'))}
      <div id="ca-item-section">${section('Saved item',`<select id="ca-item"><option value="">Choose item…</option>${items.map(x=>`<option value="${x.id}" data-sku="${esc(x.sku||'')}" data-part="${esc(x.part_number||'')}" data-desc="${esc(x.description||'')}" data-uom="${esc(x.base_uom||'EA')}">${esc(x.part_number||x.sku||x.description||'Item')}</option>`).join('')}</select>`)}</div>
      <div id="ca-package-section" style="display:none">${section('Package type',choiceGrid('ca-package',packageChoices,'BOX'))}</div>
      ${section('2 · Quantity',`<div class="row"><div class="field"><label>Quantity</label><input id="ca-qty" type="number" step="any" value="1"></div><div class="field"><label>UOM</label><select id="ca-uom">${UOMS.map(x=>`<option>${x}</option>`).join('')}</select></div></div>`)}
      ${section('3 · Optional details',`<div class="field"><label>Description</label><input id="ca-desc"></div><div class="row"><div class="field"><label>Weight lb</label><input id="ca-weight" type="number" step="any"></div><div class="field"><label>L</label><input id="ca-l" type="number" step="any"></div><div class="field"><label>W</label><input id="ca-w" type="number" step="any"></div><div class="field"><label>H</label><input id="ca-h" type="number" step="any"></div></div><div class="row"><div class="field"><label>Lot</label><input id="ca-lot"></div><div class="field"><label>Serial</label><input id="ca-serial"></div></div><div class="field"><label>Location</label><select id="ca-location"><option value="">Same / unassigned</option>${locations.map(x=>`<option value="${x.id}">${esc(x.code)}</option>`).join('')}</select></div>`)}
      <div id="ca-msg"></div><button class="primary wide" id="ca-save">Add inside</button><button class="secondary wide" id="ca-cancel">Cancel</button>`);
    bindChoiceGroup('ca-kind',()=>{const k=selectedChoice('ca-kind');document.getElementById('ca-item-section').style.display=k==='SAVED ITEM'?'block':'none';document.getElementById('ca-package-section').style.display=k==='PACKAGE'?'block':'none'});bindChoiceGroup('ca-package');
    document.getElementById('ca-item').onchange=e=>{const o=e.target.selectedOptions[0];if(!o)return;document.getElementById('ca-desc').value=o.dataset.desc||'';document.getElementById('ca-uom').value=UOMS.includes(o.dataset.uom)?o.dataset.uom:'EA'};
    document.getElementById('ca-save').onclick=async()=>{try{const kind=selectedChoice('ca-kind'),o=document.getElementById('ca-item')?.selectedOptions?.[0];const item=kind==='SAVED ITEM'?{sku:o?.dataset.sku||'',part_number:o?.dataset.part||'',package_type:'UNIT'}:{sku:'',part_number:'',package_type:selectedChoice('ca-package')||'BOX'};await createCargoChild(parent.id,{...item,quantity:num('ca-qty')||1,uom:val('ca-uom'),description:val('ca-desc'),weight_lb:num('ca-weight'),length_in:num('ca-l'),width_in:num('ca-w'),height_in:num('ca-h'),lot_number:val('ca-lot'),serial_number:val('ca-serial')});await open(parent.id)}catch(e){msg('ca-msg',e)}};
    document.getElementById('ca-cancel').onclick=()=>open(parent.id);
  }

  function section(title,body){return `<div class="card"><div class="eyebrow">${title}</div><div style="margin-top:12px">${body}</div></div>`}
  function choiceGrid(id,choices,selected){return `<div id="${id}" class="chips">${choices.map(x=>`<button type="button" class="chip ${x===selected?'selected-choice':''}" data-choice="${esc(x)}" style="cursor:pointer">${esc(x)}</button>`).join('')}</div>`}
  function bindChoiceGroup(id,onchange){const root=document.getElementById(id);if(!root)return;root.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{root.querySelectorAll('[data-choice]').forEach(x=>x.classList.remove('selected-choice'));b.classList.add('selected-choice');onchange?.()})}
  function selectedChoice(id){return document.querySelector(`#${id} .selected-choice`)?.dataset.choice||''}
  function dims(n){return n.length_in!=null&&n.width_in!=null&&n.height_in!=null?`${Number(n.length_in)}×${Number(n.width_in)}×${Number(n.height_in)} in`:''}
  function val(id){return document.getElementById(id)?.value?.trim?.()??document.getElementById(id)?.value??''}
  function num(id){const v=document.getElementById(id)?.value;return v===''||v==null?null:Number(v)}
  function msg(id,e){const el=document.getElementById(id);if(el)el.innerHTML=`<p class="warning">${esc(e.message||e)}</p>`}
  return {list,open};
}
