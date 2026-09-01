import { listEntities, listEntityItems, listInventoryItems, findExpectedReceipts, findExistingReceiptReference, createWarehouseReceiptTree } from './live-data.js';

const PACKAGE_TYPES=['PALLET','CRATE','SKID','BOX','CARTON','BAG','ENVELOPE','DRUM','BUNDLE','TOTE','LOOSE PIECE','CONTAINER'];
const COMMON_OUTER=['PALLET','CRATE','SKID','BOX','LOOSE PIECE','CONTAINER'];
const COMMON_INNER=['BOX','CARTON','BAG','ENVELOPE','TOTE'];
const REF_TYPES=['PO','BOL','PRO','TRACKING','SO','ASN','CUSTOMER REF'];

export function createGuidedWR({main,shell,esc}){
  let d={tree:[],reference:'',referenceType:'CUSTOMER REF',customer:null,outerType:'PALLET',outerQty:1,innerType:'',innerQty:0,mode:'same',items:[]};
  const preset=(label,value,current,attr='data-value')=>`<button type="button" class="preset ${value===current?'selected':''}" ${attr}="${esc(value)}">${esc(label)}</button>`;
  const error=(msg)=>`<div class="notice warning">${esc(msg)}</div>`;

  async function start(){
    d={tree:[],reference:'',referenceType:'CUSTOMER REF',customer:null,outerType:'PALLET',outerQty:1,innerType:'',innerQty:0,mode:'same',items:[]};
    shell('Warehouse · Receive','What arrived?',`<p class="muted">Scan or search first. If NODARA cannot identify it, create a new receipt from saved records.</p><div class="card"><div class="field"><label>PO, BOL, PRO, tracking, ASN or reference</label><input id="gwr-find" autocomplete="off" placeholder="Scan or type"></div><button class="primary wide" id="gwr-search">Find expected cargo</button><button class="secondary wide" id="gwr-new">New receipt</button><div id="gwr-search-status"></div></div>`);
    document.getElementById('gwr-search').onclick=searchExpected;
    document.getElementById('gwr-new').onclick=chooseCustomer;
    document.getElementById('gwr-find').onkeydown=e=>{if(e.key==='Enter')searchExpected()};
  }

  async function searchExpected(){
    const q=document.getElementById('gwr-find').value.trim(),out=document.getElementById('gwr-search-status');
    if(!q){out.innerHTML=error('Scan or enter a reference first.');return}
    out.innerHTML='<p class="muted">Searching…</p>';
    try{
      const rows=await findExpectedReceipts(q);
      if(!rows.length){d.reference=q;out.innerHTML=`<div class="notice">No expected receipt matched. NODARA can start a new receipt with <b>${esc(q)}</b>.</div><button class="secondary wide" id="gwr-use-new">Continue as new receipt</button>`;document.getElementById('gwr-use-new').onclick=chooseCustomer;return}
      const r=rows[0];d.reference=q;d.description=r.description||'';d.expected=r;
      shell('Warehouse · Receive','Expected cargo found.',`<div class="card"><div class="status"><span>Reference</span><b>${esc(q)}</b></div><div class="status"><span>Description</span><b>${esc(r.description||'—')}</b></div><div class="status"><span>Expected</span><b>${esc(r.expected_quantity||'—')} ${esc(r.expected_package_type||'')}</b></div><div class="notice good">Expected record matched. Physical receiving will verify what actually arrived.</div><button class="primary wide" id="gwr-expected-next">Start receiving</button></div>`);
      document.getElementById('gwr-expected-next').onclick=chooseCustomer;
    }catch(e){out.innerHTML=error(e.message)}
  }

  async function chooseCustomer(){
    shell('Warehouse · Receive','Who does this belong to?','<p class="muted">Choose a saved entity. This lets NODARA load customer-specific items, aliases and rules.</p><div id="gwr-customer-list"><p class="muted">Loading saved entities…</p></div>');
    try{
      const rows=await listEntities();
      const customers=rows.filter(x=>!x.roles?.length||x.roles.includes('customer')||x.roles.includes('consignee')||x.roles.includes('shipper'));
      document.getElementById('gwr-customer-list').innerHTML=`<div class="card"><div class="preset-grid">${customers.slice(0,20).map(x=>`<button class="preset-card" data-customer="${x.id}"><b>${esc(x.name)}</b><small>${esc(x.code||x.roles?.join(' · ')||'Saved entity')}</small></button>`).join('')}</div>${customers.length?'<div class="divider"></div>':''}<button class="secondary wide" id="gwr-no-customer">Warehouse-only / no customer</button><button class="subtle wide" id="gwr-manual-customer">Use a new name this time</button></div>`;
      document.querySelectorAll('[data-customer]').forEach(b=>b.onclick=()=>{d.customer=customers.find(x=>x.id===b.dataset.customer);referenceStep()});
      document.getElementById('gwr-no-customer').onclick=()=>{d.customer=null;referenceStep()};
      document.getElementById('gwr-manual-customer').onclick=manualCustomer;
    }catch(e){document.getElementById('gwr-customer-list').innerHTML=error(e.message)}
  }

  function manualCustomer(){
    shell('Warehouse · Receive','New customer name.',`<p class="muted">Use this only when the entity is not saved yet.</p><div class="card"><div class="field"><label>Name</label><input id="gwr-customer-name"></div><button class="primary wide" id="gwr-customer-name-next">Continue</button><button class="secondary wide" id="gwr-customer-back">Back to saved entities</button></div>`);
    document.getElementById('gwr-customer-name-next').onclick=()=>{const name=document.getElementById('gwr-customer-name').value.trim();if(!name)return;d.customer={name,manual:true};referenceStep()};
    document.getElementById('gwr-customer-back').onclick=chooseCustomer;
  }

  async function referenceStep(){
    shell('Warehouse · Receive','What identifies this receipt?',`<p class="muted">Choose the reference type instead of typing a label.</p><div class="card"><div class="preset-grid compact">${REF_TYPES.map(x=>preset(x,x,d.referenceType,'data-ref-type')).join('')}</div><div class="field"><label id="gwr-ref-label">${esc(d.referenceType)}</label><input id="gwr-ref" value="${esc(d.reference||'')}" placeholder="Scan or type value"></div><div id="gwr-ref-warning"></div><button class="primary wide" id="gwr-ref-next">Continue</button><button class="secondary wide" id="gwr-ref-skip">No reference</button></div>`);
    document.querySelectorAll('[data-ref-type]').forEach(b=>b.onclick=()=>{d.referenceType=b.dataset.refType;document.querySelectorAll('[data-ref-type]').forEach(x=>x.classList.toggle('selected',x===b));document.getElementById('gwr-ref-label').textContent=d.referenceType});
    document.getElementById('gwr-ref-next').onclick=async()=>{d.reference=document.getElementById('gwr-ref').value.trim();if(!d.reference){document.getElementById('gwr-ref-warning').innerHTML=error('Enter a reference or choose No reference.');return}try{const dup=await findExistingReceiptReference(d.reference);if(dup.length){document.getElementById('gwr-ref-warning').innerHTML=`<div class="notice warning">This reference already appears on ${dup.length} receipt${dup.length===1?'':'s'}. Partial/repeat receipts can be valid, so NODARA will not block it—but verify before continuing.</div><button class="primary wide" id="gwr-ref-confirm">Use it anyway</button>`;document.getElementById('gwr-ref-confirm').onclick=packageStep;return}}catch{}packageStep()};
    document.getElementById('gwr-ref-skip').onclick=()=>{d.reference='';packageStep()};
  }

  function packageStep(){
    shell('Warehouse · Receive','What is the outer package?',`<p class="muted">Choose the physical thing you can point to. Every outer piece becomes its own cargo record.</p><div class="card"><div class="preset-grid">${COMMON_OUTER.map(x=>preset(x,x,d.outerType,'data-outer')).join('')}</div><div class="field"><label>Other package type</label><select id="gwr-outer-more"><option value="">Choose only if needed</option>${PACKAGE_TYPES.filter(x=>!COMMON_OUTER.includes(x)).map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>How many?</label><input id="gwr-outer-qty" type="number" min="1" inputmode="numeric" value="${d.outerQty}"></div><div id="gwr-package-error"></div><button class="primary wide" id="gwr-package-next">Continue</button></div>`);
    document.querySelectorAll('[data-outer]').forEach(b=>b.onclick=()=>{d.outerType=b.dataset.outer;document.querySelectorAll('[data-outer]').forEach(x=>x.classList.toggle('selected',x===b));document.getElementById('gwr-outer-more').value=''});
    document.getElementById('gwr-outer-more').onchange=e=>{if(e.target.value){d.outerType=e.target.value;document.querySelectorAll('[data-outer]').forEach(x=>x.classList.remove('selected'))}};
    document.getElementById('gwr-package-next').onclick=()=>{d.outerQty=Number(document.getElementById('gwr-outer-qty').value||0);if(!Number.isInteger(d.outerQty)||d.outerQty<1){document.getElementById('gwr-package-error').innerHTML=error('Outer quantity must be a whole number of at least 1.');return}innerStep()};
  }

  function innerStep(){
    shell('Warehouse · Receive',`What is inside each ${d.outerType.toLowerCase()}?`,`<p class="muted">Skip this if there is no second physical packaging layer.</p><div class="card"><button class="choice" id="gwr-no-inner"><b>No inner package</b><small>Track contents directly inside each ${esc(d.outerType.toLowerCase())}.</small></button><div class="preset-grid" style="margin-top:14px">${COMMON_INNER.map(x=>preset(x,x,d.innerType,'data-inner')).join('')}</div><div class="field"><label>How many inside each outer package?</label><input id="gwr-inner-qty" type="number" min="1" inputmode="numeric" value="${d.innerQty||''}" placeholder="e.g. 10"></div><div id="gwr-inner-error"></div><button class="primary wide" id="gwr-inner-next">Continue</button></div>`);
    document.getElementById('gwr-no-inner').onclick=()=>{d.innerType='';d.innerQty=0;contentsChoice()};
    document.querySelectorAll('[data-inner]').forEach(b=>b.onclick=()=>{d.innerType=b.dataset.inner;document.querySelectorAll('[data-inner]').forEach(x=>x.classList.toggle('selected',x===b))});
    document.getElementById('gwr-inner-next').onclick=()=>{if(!d.innerType){document.getElementById('gwr-inner-error').innerHTML=error('Choose an inner package or No inner package.');return}d.innerQty=Number(document.getElementById('gwr-inner-qty').value||0);if(!Number.isInteger(d.innerQty)||d.innerQty<1){document.getElementById('gwr-inner-error').innerHTML=error('Inner quantity must be a whole number of at least 1.');return}contentsChoice()};
  }

  function contentsChoice(){
    shell('Warehouse · Receive','How should contents be tracked?',`<p class="muted">Choose the simplest option that preserves the truth.</p><div class="card"><button class="choice" id="gwr-same"><b>Same contents</b><small>All ${esc((d.innerType||d.outerType).toLowerCase())} packages contain the same item mix. Enter once.</small></button><button class="choice" id="gwr-mixed"><b>Mixed contents</b><small>Different packages contain different items.</small></button><button class="choice" id="gwr-package-only"><b>Package-level only</b><small>No SKU/unit inventory required for this receipt.</small></button></div>`);
    document.getElementById('gwr-same').onclick=()=>{d.mode='same';savedItemsStep()};
    document.getElementById('gwr-mixed').onclick=()=>{d.mode='mixed';mixedIntro()};
    document.getElementById('gwr-package-only').onclick=()=>{d.mode='package';buildPackageOnly();review()};
  }

  async function getSavedItems(){
    if(d.customer?.id){const profiles=await listEntityItems(d.customer.id);if(profiles.length)return profiles.map(p=>({id:p.inventory_item_id,sku:p.customer_sku||p.inventory_items?.sku,part_number:p.customer_part_number||p.inventory_items?.part_number,description:p.description_override||p.inventory_items?.description,uom:p.base_uom_override||p.inventory_items?.base_uom||'EA',serial_tracking:p.serial_tracking_override??p.inventory_items?.serial_tracking,lot_tracking:p.lot_tracking_override??p.inventory_items?.lot_tracking,weight:p.default_weight_lb,length:p.default_length_in,width:p.default_width_in,height:p.default_height_in,dg:p.dg,fragile:p.fragile}));}
    return listInventoryItems();
  }

  async function savedItemsStep(){
    shell('Warehouse · Receive','What is inside?','<p class="muted">Choose from saved items first. You can add multiple items to the package.</p><div id="gwr-items"><p class="muted">Loading saved items…</p></div>');
    try{const items=await getSavedItems();d.catalog=items;d.items=[];renderItemPicker()}catch(e){document.getElementById('gwr-items').innerHTML=error(e.message)}
  }
  function renderItemPicker(){
    const rows=d.catalog||[];
    document.getElementById('gwr-items').innerHTML=`<div class="card"><div class="field"><label>Search saved items</label><input id="gwr-item-search" placeholder="Part, SKU, description"></div><div id="gwr-item-options" class="preset-grid">${itemCards(rows)}</div><div class="eyebrow" style="margin-top:22px">Selected</div><div id="gwr-selected-items">${selectedItems()}</div><div id="gwr-item-error"></div><button class="primary wide" id="gwr-items-next">Continue</button></div>`;
    bindItemCards(rows);
    document.getElementById('gwr-item-search').oninput=e=>{const q=e.target.value.toLowerCase(),f=rows.filter(x=>[x.part_number,x.sku,x.description].filter(Boolean).some(v=>String(v).toLowerCase().includes(q)));document.getElementById('gwr-item-options').innerHTML=itemCards(f);bindItemCards(f)};
    document.getElementById('gwr-items-next').onclick=()=>{syncSelectedQty();const bad=d.items.find(x=>!Number.isFinite(x.qty)||x.qty<=0);if(!d.items.length||bad){document.getElementById('gwr-item-error').innerHTML=error('Choose at least one saved item and enter a quantity greater than zero.');return}const serialBad=d.items.find(x=>x.serial_tracking&&x.qty!==1);if(serialBad){document.getElementById('gwr-item-error').innerHTML=error(`${serialBad.part_number||serialBad.sku} is serialized. Track each serial as quantity 1.`);return}buildSame();review()};
  }
  const itemCards=rows=>rows.slice(0,40).map((x,i)=>`<button type="button" class="preset-card" data-item-id="${esc(x.id)}"><b>${esc(x.part_number||x.sku||'Item')}</b><small>${esc(x.description||x.sku||'Saved item')}</small></button>`).join('')||'<div class="notice">No saved items yet. Add them under Entities/Items first for the fastest workflow.</div>';
  function bindItemCards(rows){document.querySelectorAll('[data-item-id]').forEach(b=>b.onclick=()=>{const x=rows.find(i=>String(i.id)===b.dataset.itemId);if(!x)return;if(!d.items.some(i=>i.id===x.id))d.items.push({...x,qty:1});document.getElementById('gwr-selected-items').innerHTML=selectedItems()})}
  function selectedItems(){return d.items.length?d.items.map((x,i)=>`<div class="selection-row"><div><b>${esc(x.part_number||x.sku||'Item')}</b><small>${esc(x.description||'')}</small>${x.serial_tracking?'<small class="warning">Serial tracked · qty must be 1</small>':''}</div><input id="gwr-selected-qty-${i}" type="number" min="1" value="${x.qty||1}"><button type="button" data-remove-item="${i}">×</button></div>`).join(''):'<div class="notice">No items selected.</div>'}
  function syncSelectedQty(){d.items=d.items.map((x,i)=>({...x,qty:Number(document.getElementById(`gwr-selected-qty-${i}`)?.value||x.qty||0)}))}

  function mixedIntro(){
    shell('Warehouse · Receive','Mixed cargo.',`<p class="muted">Mixed contents require package-level verification. NODARA will create ${d.outerQty*(d.innerQty||1)} editable package records so each can differ.</p><div class="card"><div class="notice">For speed, use scanning/OCR here next. For now, create the physical packages first and edit each package's contents from Cargo after the WR is created.</div><button class="primary wide" id="gwr-mixed-create">Create physical structure</button><button class="secondary wide" id="gwr-mixed-back">Back</button></div>`);
    document.getElementById('gwr-mixed-create').onclick=()=>{buildPackageOnly();review('Mixed contents must be verified package-by-package after creation.');};
    document.getElementById('gwr-mixed-back').onclick=contentsChoice;
  }

  function buildSame(){
    const makeItem=x=>({type:'UNIT',quantity:x.qty,uom:x.uom||'EA',sku:x.sku||null,part_number:x.part_number||null,description:x.description||null,weight_lb:x.weight||null,length_in:x.length||null,width_in:x.width||null,height_in:x.height||null,metadata:{inventory_item_id:x.id,dg:!!x.dg,fragile:!!x.fragile}});
    const contents=d.items.map(makeItem);
    const makeInner=()=>({type:d.innerType,quantity:1,uom:d.innerType,children:JSON.parse(JSON.stringify(contents))});
    d.tree=Array.from({length:d.outerQty},()=>({type:d.outerType,quantity:1,uom:d.outerType,children:d.innerType?Array.from({length:d.innerQty},makeInner):JSON.parse(JSON.stringify(contents))}));
  }
  function buildPackageOnly(){
    const makeInner=()=>({type:d.innerType,quantity:1,uom:d.innerType,children:[]});
    d.tree=Array.from({length:d.outerQty},()=>({type:d.outerType,quantity:1,uom:d.outerType,children:d.innerType?Array.from({length:d.innerQty},makeInner):[]}));
  }

  function validate(){
    const issues=[];
    if(!d.tree?.length)issues.push('No cargo structure exists.');
    if(d.outerQty<1)issues.push('Outer quantity must be at least 1.');
    if(d.innerType&&d.innerQty<1)issues.push('Inner package quantity is missing.');
    if(d.mode==='same'&&!d.items.length)issues.push('No inventory item was selected.');
    return issues;
  }

  function review(extra=''){
    const issues=validate();const packageCount=d.outerQty+(d.innerType?d.outerQty*d.innerQty:0);const itemSummary=d.items?.map(x=>`${x.part_number||x.sku} × ${x.qty*(d.innerType?d.outerQty*d.innerQty:d.outerQty)}`).join(' · ')||'Package-level only';
    shell('Warehouse · Receive','Ready to receive.',`<p class="muted">NODARA checks the structure before anything is written.</p><div class="card"><div class="status"><span>Customer</span><b>${esc(d.customer?.name||'Warehouse only')}</b></div><div class="status"><span>Reference</span><b>${esc(d.reference||'—')}</b></div><div class="status"><span>Physical structure</span><b>${d.outerQty} ${esc(d.outerType)}${d.innerType?` → ${d.outerQty*d.innerQty} ${esc(d.innerType)}`:''}</b></div><div class="status"><span>Tracked packages</span><b>${packageCount}</b></div><div class="status"><span>Inventory</span><b>${esc(itemSummary)}</b></div>${extra?`<div class="notice warning">${esc(extra)}</div>`:''}${issues.length?issues.map(error).join(''):'<div class="notice good">No blocking errors found.</div>'}<div id="gwr-save-status"></div><button class="primary wide" id="gwr-create" ${issues.length?'disabled':''}>Create WR</button><button class="secondary wide" id="gwr-review-back">Change packaging</button></div>`);
    document.getElementById('gwr-create').onclick=save;
    document.getElementById('gwr-review-back').onclick=packageStep;
  }

  async function save(){
    const issues=validate();if(issues.length)return;const b=document.getElementById('gwr-create'),out=document.getElementById('gwr-save-status');b.disabled=true;b.textContent='Creating…';
    try{const r=await createWarehouseReceiptTree({reference:d.reference,customer:d.customer?.name||null,description:d.description||null,tree:d.tree});shell('Warehouse · Receive','Receipt created.',`<div class="card"><div class="eyebrow">Warehouse receipt</div><h2>${esc(r.receipt_number)}</h2><div class="notice good">Cargo structure and inventory were saved atomically.</div><button class="primary wide" id="gwr-another">Receive another</button></div>`);document.getElementById('gwr-another').onclick=start}catch(e){b.disabled=false;b.textContent='Create WR';out.innerHTML=error(e.message)}
  }

  return {start};
}
