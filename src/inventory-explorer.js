import { getInventorySnapshot, getInventoryItemCargoTree, updateCargoNode, createCargoChild, deleteCargoSubtree } from './live-data.js';

export function createInventoryExplorer({ main, shell, esc, packageTypes }) {
  let currentItem = null;
  let currentRows = [];

  async function list() {
    shell('Inventory','Inventory.','<p class="muted">Loading live inventory…</p>');
    try {
      const rows = await getInventorySnapshot();
      if (!rows.length) return shell('Inventory','Inventory.',`<div class="empty"><b>No inventory yet.</b></div>`);
      shell('Inventory','Inventory.',`<div class="card"><div class="field"><label>Search</label><input id="inventory-filter" placeholder="Part, SKU, description…"></div></div><div id="inventory-list">${renderList(rows)}</div>`);
      document.getElementById('inventory-filter').oninput = e => {
        const q = e.target.value.trim().toLowerCase();
        const filtered = !q ? rows : rows.filter(r => [r.item_key,r.sku,r.part_number,r.description].filter(Boolean).some(v=>String(v).toLowerCase().includes(q)));
        document.getElementById('inventory-list').innerHTML = renderList(filtered);
        bindList(filtered);
      };
      bindList(rows);
    } catch (e) { shell('NODARA','Inventory could not load',`<p class="warning">${esc(e.message)}</p>`); }
  }

  function renderList(rows) {
    return rows.map((r,i)=>`<button class="inventory-card" data-item-index="${i}" style="width:100%;text-align:left;margin-top:10px"><div><b>${esc(r.part_number||r.sku||r.item_key||'Item')}</b><span>${esc(r.description||'')}</span></div><div class="inventory-numbers"><strong>${Number(r.available||0)} ${esc(r.base_uom||'EA')}</strong><span>${Number(r.on_hand||0)} on hand · ${Number(r.reserved||0)} reserved</span><small>${Number(r.package_count||0)} physical packages${r.locations?.length?' · '+esc(r.locations.join(' · ')):''}</small></div></button>`).join('');
  }
  function bindList(rows){document.querySelectorAll('[data-item-index]').forEach(b=>b.onclick=()=>openItem(rows[Number(b.dataset.itemIndex)]));}

  async function openItem(item) {
    currentItem = item;
    shell('Inventory · Item',esc(item.part_number||item.sku||item.item_key),'<p class="muted">Loading physical cargo tree…</p>');
    try {
      currentRows = await getInventoryItemCargoTree(item.inventory_item_id);
      shell('Inventory · Item',esc(item.part_number||item.sku||item.item_key),`<div class="card"><div class="status"><span>Available</span><b>${Number(item.available||0)} ${esc(item.base_uom||'EA')}</b></div><div class="status"><span>On hand</span><b>${Number(item.on_hand||0)}</b></div><div class="status"><span>Reserved</span><b>${Number(item.reserved||0)}</b></div>${item.description?`<div class="status"><span>Description</span><b>${esc(item.description)}</b></div>`:''}</div><div class="eyebrow" style="margin-top:26px">Physical cargo</div><div id="cargo-tree">${renderTree(currentRows)}</div><button class="secondary wide" id="inventory-back">Back to inventory</button>`);
      bindTree(); document.getElementById('inventory-back').onclick=list;
    } catch(e){shell('Inventory','Could not open item',`<p class="warning">${esc(e.message)}</p>`)}
  }

  function renderTree(rows){
    if(!rows.length)return '<div class="empty"><b>No physical cargo nodes found.</b></div>';
    const byId=new Map(rows.map(r=>[r.id,{...r,children:[]}])) ; const roots=[];
    byId.forEach(n=>{if(n.parent_id&&byId.has(n.parent_id))byId.get(n.parent_id).children.push(n);else roots.push(n)});
    const node=(n,depth=0)=>`<button class="record cargo-node" data-node-id="${n.id}" style="display:block;width:calc(100% - ${depth*14}px);margin-left:${depth*14}px;text-align:left"><div class="status"><span><b>${esc(n.package_type||'PACKAGE')}</b> · ${esc(n.uin||n.handling_unit_code||'')}</span><b>${Number(n.quantity||0)} ${esc(n.uom||'')}</b></div>${n.description?`<div class="muted">${esc(n.description)}</div>`:''}<div class="chips"><span class="chip">${esc(n.status)}</span>${n.weight_lb!=null?`<span class="chip">${Number(n.weight_lb)} lb</span>`:''}${n.length_in!=null&&n.width_in!=null&&n.height_in!=null?`<span class="chip">${Number(n.length_in)}×${Number(n.width_in)}×${Number(n.height_in)} in</span>`:''}${n.location_code?`<span class="chip">${esc(n.location_code)}</span>`:''}${n.serial_number?`<span class="chip">SN ${esc(n.serial_number)}</span>`:''}${n.lot_number?`<span class="chip">LOT ${esc(n.lot_number)}</span>`:''}</div></button>${n.children.map(c=>node(c,depth+1)).join('')}`;
    return roots.map(r=>node(r)).join('');
  }
  function bindTree(){document.querySelectorAll('[data-node-id]').forEach(b=>b.onclick=()=>editNode(currentRows.find(r=>r.id===b.dataset.nodeId)));}

  function editNode(n){
    shell('Inventory · Cargo node',esc(n.uin||n.handling_unit_code||n.package_type),`<p class="muted">Every level is its own record. Changes here affect this exact package/unit only.</p><div class="card"><div class="row"><div class="field"><label>Package type</label><select id="node-type">${packageTypes.map(x=>`<option ${x===n.package_type?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Quantity</label><input id="node-qty" type="number" value="${esc(n.quantity)}"></div></div><div class="field"><label>Description</label><input id="node-desc" value="${esc(n.description||'')}"></div><div class="row"><div class="field"><label>UOM</label><input id="node-uom" value="${esc(n.uom||'')}"></div><div class="field"><label>Weight lb</label><input id="node-weight" type="number" step="any" value="${esc(n.weight_lb??'')}"></div></div><div class="row"><div class="field"><label>Length in</label><input id="node-l" type="number" step="any" value="${esc(n.length_in??'')}"></div><div class="field"><label>Width in</label><input id="node-w" type="number" step="any" value="${esc(n.width_in??'')}"></div><div class="field"><label>Height in</label><input id="node-h" type="number" step="any" value="${esc(n.height_in??'')}"></div></div><div class="row"><div class="field"><label>Lot</label><input id="node-lot" value="${esc(n.lot_number||'')}"></div><div class="field"><label>Serial</label><input id="node-serial" value="${esc(n.serial_number||'')}"></div></div><div class="field"><label>UIN</label><input id="node-uin" value="${esc(n.uin||'')}"></div><div id="node-status"></div><button class="primary wide" id="node-save">Save changes</button><button class="secondary wide" id="node-add">Add child package / item</button><button class="secondary wide" id="node-back">Back to item</button><button class="subtle wide" id="node-delete">Delete this level + contents</button></div>`);
    document.getElementById('node-save').onclick=async()=>{const s=document.getElementById('node-status');try{await updateCargoNode(n.id,{package_type:document.getElementById('node-type').value,quantity:Number(document.getElementById('node-qty').value||0),uom:document.getElementById('node-uom').value,description:document.getElementById('node-desc').value,weight_lb:num('node-weight'),length_in:num('node-l'),width_in:num('node-w'),height_in:num('node-h'),lot_number:document.getElementById('node-lot').value,serial_number:document.getElementById('node-serial').value,uin:document.getElementById('node-uin').value});await openItem(currentItem)}catch(e){s.innerHTML=`<p class="warning">${esc(e.message)}</p>`}};
    document.getElementById('node-add').onclick=()=>addChild(n);
    document.getElementById('node-back').onclick=()=>openItem(currentItem);
    document.getElementById('node-delete').onclick=async()=>{if(!confirm('Delete this cargo level and everything contained inside it?'))return;try{await deleteCargoSubtree(n.id);await list()}catch(e){document.getElementById('node-status').innerHTML=`<p class="warning">${esc(e.message)}</p>`}};
  }

  function addChild(parent){
    shell('Inventory · Cargo node','Add contained cargo',`<p class="muted">Create a new package or item inside ${esc(parent.uin||parent.package_type)}.</p><div class="card"><div class="row"><div class="field"><label>Type</label><select id="child-type">${packageTypes.map(x=>`<option>${x}</option>`).join('')}<option value="UNIT">UNIT</option></select></div><div class="field"><label>Quantity</label><input id="child-qty" type="number" value="1"></div></div><div class="row"><div class="field"><label>SKU</label><input id="child-sku"></div><div class="field"><label>Part number</label><input id="child-part"></div></div><div class="field"><label>Description</label><input id="child-desc"></div><div class="row"><div class="field"><label>Weight lb</label><input id="child-weight" type="number" step="any"></div><div class="field"><label>L</label><input id="child-l" type="number" step="any"></div><div class="field"><label>W</label><input id="child-w" type="number" step="any"></div><div class="field"><label>H</label><input id="child-h" type="number" step="any"></div></div><div class="row"><div class="field"><label>Lot</label><input id="child-lot"></div><div class="field"><label>Serial</label><input id="child-serial"></div></div><div id="child-status"></div><button class="primary wide" id="child-save">Add</button><button class="secondary wide" id="child-back">Cancel</button></div>`);
    document.getElementById('child-save').onclick=async()=>{try{await createCargoChild(parent.id,{package_type:document.getElementById('child-type').value,quantity:Number(document.getElementById('child-qty').value||1),description:document.getElementById('child-desc').value,sku:document.getElementById('child-sku').value,part_number:document.getElementById('child-part').value,weight_lb:num('child-weight'),length_in:num('child-l'),width_in:num('child-w'),height_in:num('child-h'),lot_number:document.getElementById('child-lot').value,serial_number:document.getElementById('child-serial').value});await openItem(currentItem)}catch(e){document.getElementById('child-status').innerHTML=`<p class="warning">${esc(e.message)}</p>`}};
    document.getElementById('child-back').onclick=()=>editNode(parent);
  }

  function num(id){const v=document.getElementById(id)?.value;return v===''||v==null?null:Number(v)}
  return { list, openItem };
}
