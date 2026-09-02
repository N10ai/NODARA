import { listEntities, listEntityItems, listInventoryItems, findExistingReceiptReference, createWarehouseReceiptObject } from './live-data.js?v=20260901-2045';
import { makePackage, makeItem, repeatPackage } from './cargo-tree-builder.js';

const PACKAGE_TYPES=['PALLET','CRATE','SKID','BOX','CARTON','BAG','ENVELOPE','DRUM','BUNDLE','TOTE','LOOSE PIECE','CONTAINER'];
const REF_TYPES=['PO','BOL','PRO','TRACKING','SO','ASN','CUSTOMER_REF'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createWRObjectEditor({main}){
  let state={customerId:'',description:'',references:[{type:'CUSTOMER_REF',value:'',primary:true}],outerType:'PALLET',outerQty:1,innerType:'',innerQty:0,mode:'same',items:[],entities:[],catalog:[]};

  async function start(){
    state={customerId:'',description:'',references:[{type:'CUSTOMER_REF',value:'',primary:true}],outerType:'PALLET',outerQty:1,innerType:'',innerQty:0,mode:'same',items:[],entities:[],catalog:[]};
    render('Loading saved records…');
    try{state.entities=await listEntities();state.catalog=await listInventoryItems();render()}catch(e){render(e.message)}
  }

  function render(message=''){
    main.innerHTML=`
      <div class="wr-object-head"><div><div class="eyebrow">Warehouse Receipt · Draft</div><h1 class="title">New Warehouse Receipt</h1></div><span class="status-pill draft">Draft</span></div>
      <div class="record-tabs wr-object-tabs">
        <button data-jump="wr-overview" class="active">Overview</button><button data-jump="wr-references">References <span>${state.references.filter(r=>r.value).length}</span></button><button data-jump="wr-cargo">Cargo</button><button data-jump="wr-documents">Documents</button><button data-jump="wr-charges">Charges</button>
      </div>
      ${message?`<div class="notice ${message.includes('error')?'warning':''}">${esc(message)}</div>`:''}
      <div class="wr-object-layout">
        <div class="wr-object-main">
          ${overviewSection()}
          ${referenceSection()}
          ${cargoSection()}
          ${documentsSection()}
          ${chargesSection()}
        </div>
        <aside class="wr-draft-summary">${summary()}</aside>
      </div>
      <div class="wr-savebar"><button class="secondary" id="wr-cancel-object">Cancel</button><div id="wr-save-status"></div><button class="primary" id="wr-create-object">Create Warehouse Receipt</button></div>`;
    bind();
  }

  function overviewSection(){
    const entities=state.entities.filter(e=>!e.roles?.length||e.roles.includes('customer')||e.roles.includes('consignee')||e.roles.includes('shipper'));
    return `<section class="record-section wr-object-section" id="wr-overview"><div class="section-heading"><div><span class="section-kicker">01</span><h3>Overview</h3></div><span class="section-state ${state.customerId?'complete':''}">${state.customerId?'Ready':'Choose customer'}</span></div><div class="detail-grid"><div class="field object-field"><label>Customer / account</label><select id="wr-customer"><option value="">Warehouse / unassigned</option>${entities.map(e=>`<option value="${e.id}" ${e.id===state.customerId?'selected':''}>${esc(e.name)}${e.code?' · '+esc(e.code):''}</option>`).join('')}</select><small>Saved entity</small></div><div class="field object-field"><label>Description / commodity</label><input id="wr-description" value="${esc(state.description)}" placeholder="Optional overall description"><small>Applies to the receipt, not every package</small></div></div></section>`;
  }

  function referenceSection(){
    return `<section class="record-section wr-object-section" id="wr-references"><div class="section-heading"><div><span class="section-kicker">02</span><h3>References</h3></div><button class="secondary compact-btn" id="wr-add-reference">＋ Add</button></div><div class="object-list">${state.references.map((r,i)=>`<div class="object-line"><select data-ref-type="${i}">${REF_TYPES.map(t=>`<option ${t===r.type?'selected':''}>${t}</option>`).join('')}</select><input data-ref-value="${i}" value="${esc(r.value)}" placeholder="Scan or type"><label class="primary-ref"><input type="radio" name="primary-ref" data-ref-primary="${i}" ${r.primary?'checked':''}> Primary</label><button class="subtle" data-ref-remove="${i}">×</button></div>`).join('')}</div></section>`;
  }

  function cargoSection(){
    return `<section class="record-section wr-object-section" id="wr-cargo"><div class="section-heading"><div><span class="section-kicker">03</span><h3>Cargo</h3></div><span class="section-state ${state.items.length||state.mode==='package'?'complete':''}">${cargoSummary()}</span></div>
      <div class="cargo-builder-row"><div><label>Outer package</label><select id="wr-outer-type">${PACKAGE_TYPES.map(t=>`<option ${t===state.outerType?'selected':''}>${t}</option>`).join('')}</select></div><div><label>Qty</label><input id="wr-outer-qty" type="number" min="1" value="${state.outerQty}"></div><div><label>Inside each</label><select id="wr-inner-type"><option value="">No inner package</option>${PACKAGE_TYPES.map(t=>`<option ${t===state.innerType?'selected':''}>${t}</option>`).join('')}</select></div><div><label>Qty inside</label><input id="wr-inner-qty" type="number" min="0" value="${state.innerQty||''}" ${state.innerType?'':'disabled'}></div></div>
      <div class="mode-switch"><button data-mode="same" class="${state.mode==='same'?'selected':''}">Track item contents</button><button data-mode="package" class="${state.mode==='package'?'selected':''}">Package-level only</button></div>
      ${state.mode==='same'?itemBuilder():`<div class="notice">NODARA will track the physical packages without SKU/unit inventory. You can add detailed contents later from Cargo.</div>`}
    </section>`;
  }

  function itemBuilder(){
    return `<div class="item-builder"><div class="item-picker"><div class="field"><label>Add saved item</label><select id="wr-item-select"><option value="">Choose part / SKU</option>${state.catalog.map(x=>`<option value="${x.id}">${esc(x.part_number||x.sku||'Item')} · ${esc(x.description||'')}</option>`).join('')}</select></div><button class="secondary compact-btn" id="wr-add-item">＋ Add item</button></div><div class="object-list">${state.items.length?state.items.map((x,i)=>`<div class="item-object"><div><b>${esc(x.part_number||x.sku||'Item')}</b><small>${esc(x.description||'')}</small></div><div class="field"><label>Qty per ${esc((state.innerType||state.outerType).toLowerCase())}</label><input data-item-qty="${i}" type="number" min="0.0001" step="any" value="${x.qty}"></div>${x.lot_tracking?`<div class="field"><label>Lot</label><input data-item-lot="${i}" value="${esc(x.lot||'')}"></div>`:''}${x.serial_tracking?`<div class="field"><label>Serial</label><input data-item-serial="${i}" value="${esc(x.serial||'')}"></div>`:''}<button class="subtle" data-item-remove="${i}">×</button></div>`).join(''):'<div class="empty compact">No item contents added yet.</div>'}</div></div>`;
  }

  function documentsSection(){return `<section class="record-section wr-object-section" id="wr-documents"><div class="section-heading"><div><span class="section-kicker">04</span><h3>Documents</h3></div><span class="section-state">Optional</span></div><div class="module-inline"><button class="secondary" id="wr-doc-placeholder">＋ Attach document</button><span class="muted">BOL, packing list, POD, photos and compliance documents live on this WR.</span></div></section>`}
  function chargesSection(){return `<section class="record-section wr-object-section" id="wr-charges"><div class="section-heading"><div><span class="section-kicker">05</span><h3>Charges</h3></div><span class="section-state">Optional</span></div><div class="module-inline"><button class="secondary" id="wr-charge-placeholder">＋ Add charge</button><span class="muted">Receiving, storage, handling and accessorial charges belong to this same receipt.</span></div></section>`}

  function summary(){
    const cust=state.entities.find(e=>e.id===state.customerId)?.name||'Unassigned';
    return `<div class="eyebrow">Draft summary</div><h3>${esc(cust)}</h3><div class="summary-line"><span>References</span><b>${state.references.filter(r=>r.value).length}</b></div><div class="summary-line"><span>Outer cargo</span><b>${state.outerQty} ${esc(state.outerType)}</b></div><div class="summary-line"><span>Inner</span><b>${state.innerType?`${state.innerQty} ${esc(state.innerType)} each`:'None'}</b></div><div class="summary-line"><span>Items</span><b>${state.mode==='package'?'Package only':state.items.length}</b></div><div class="notice">Everything here will be saved as one WR transaction.</div>`;
  }
  function cargoSummary(){return `${state.outerQty} ${state.outerType}${state.innerType?` · ${state.innerQty} ${state.innerType} each`:''}`}

  function bind(){
    document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.jump)?.scrollIntoView({behavior:'smooth',block:'start'}));
    document.getElementById('wr-customer').onchange=async e=>{sync();state.customerId=e.target.value;try{if(state.customerId){const p=await listEntityItems(state.customerId);state.catalog=p.length?p.map(x=>({...x.inventory_items,id:x.inventory_item_id,part_number:x.customer_part_number||x.inventory_items?.part_number,sku:x.customer_sku||x.inventory_items?.sku,description:x.description_override||x.inventory_items?.description,lot_tracking:x.lot_tracking_override??x.inventory_items?.lot_tracking,serial_tracking:x.serial_tracking_override??x.inventory_items?.serial_tracking})):await listInventoryItems()}else state.catalog=await listInventoryItems();}catch{}render()};
    document.getElementById('wr-description').onchange=e=>{state.description=e.target.value};
    document.getElementById('wr-add-reference').onclick=()=>{sync();state.references.push({type:'PO',value:'',primary:false});render()};
    document.querySelectorAll('[data-ref-remove]').forEach(b=>b.onclick=()=>{sync();state.references.splice(Number(b.dataset.refRemove),1);if(!state.references.length)state.references=[{type:'CUSTOMER_REF',value:'',primary:true}];if(!state.references.some(r=>r.primary))state.references[0].primary=true;render()});
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{sync();state.mode=b.dataset.mode;render()});
    document.getElementById('wr-inner-type').onchange=e=>{sync();state.innerType=e.target.value;if(!state.innerType)state.innerQty=0;render()};
    document.getElementById('wr-add-item')?.addEventListener('click',()=>{sync();const id=document.getElementById('wr-item-select').value,x=state.catalog.find(i=>String(i.id)===id);if(x&&!state.items.some(i=>i.id===x.id))state.items.push({...x,qty:1,lot:'',serial:''});render()});
    document.querySelectorAll('[data-item-remove]').forEach(b=>b.onclick=()=>{sync();state.items.splice(Number(b.dataset.itemRemove),1);render()});
    document.getElementById('wr-create-object').onclick=save;
    document.getElementById('wr-cancel-object').onclick=()=>window.nodaraWRList?.();
    document.getElementById('wr-doc-placeholder').onclick=()=>alert('Document attachment will open here next; it is already part of the WR object.');
    document.getElementById('wr-charge-placeholder').onclick=()=>alert('Charge entry will open here next; it is already part of the WR object.');
  }

  function sync(){
    state.description=document.getElementById('wr-description')?.value??state.description;
    state.customerId=document.getElementById('wr-customer')?.value??state.customerId;
    state.outerType=document.getElementById('wr-outer-type')?.value??state.outerType;
    state.outerQty=Number(document.getElementById('wr-outer-qty')?.value||state.outerQty||0);
    state.innerType=document.getElementById('wr-inner-type')?.value??state.innerType;
    state.innerQty=state.innerType?Number(document.getElementById('wr-inner-qty')?.value||state.innerQty||0):0;
    state.references=state.references.map((r,i)=>({...r,type:document.querySelector(`[data-ref-type="${i}"]`)?.value||r.type,value:document.querySelector(`[data-ref-value="${i}"]`)?.value?.trim?.()||'',primary:!!document.querySelector(`[data-ref-primary="${i}"]`)?.checked}));
    state.items=state.items.map((x,i)=>({...x,qty:Number(document.querySelector(`[data-item-qty="${i}"]`)?.value||x.qty||0),lot:document.querySelector(`[data-item-lot="${i}"]`)?.value?.trim?.()||'',serial:document.querySelector(`[data-item-serial="${i}"]`)?.value?.trim?.()||''}));
  }

  function validate(){
    if(!Number.isInteger(state.outerQty)||state.outerQty<1)return 'Outer package quantity must be at least 1.';
    if(state.innerType&&(!Number.isInteger(state.innerQty)||state.innerQty<1))return 'Inner package quantity must be at least 1.';
    if(state.mode==='same'&&!state.items.length)return 'Add at least one saved item, or choose Package-level only.';
    for(const x of state.items){if(!(x.qty>0))return `${x.part_number||x.sku||'Item'} needs a quantity greater than zero.`;if(x.serial_tracking&&(x.qty!==1||!x.serial))return `${x.part_number||x.sku||'Serialized item'} must be quantity 1 with a serial number.`;if(x.lot_tracking&&!x.lot)return `${x.part_number||x.sku||'Lot-tracked item'} needs a lot number.`}
    return '';
  }

  function buildTree(){
    const itemNodes=state.mode==='same'?state.items.map(x=>makeItem({sku:x.sku||null,part_number:x.part_number||null,description:x.description||null,quantity:x.qty,uom:x.base_uom||'EA',lot_number:x.lot||null,serial_number:x.serial||null})):[];
    if(state.innerType){const inner=()=>makePackage(state.innerType,1,itemNodes.map(x=>structuredClone(x)));return repeatPackage(state.outerType,state.outerQty,Array.from({length:state.innerQty},inner));}
    return repeatPackage(state.outerType,state.outerQty,itemNodes);
  }

  async function save(){
    sync();const err=validate(),out=document.getElementById('wr-save-status');if(err){out.innerHTML=`<span class="warning">${esc(err)}</span>`;document.getElementById('wr-cargo').scrollIntoView({behavior:'smooth'});return}
    const refs=state.references.filter(r=>r.value);for(const r of refs){try{const dup=await findExistingReceiptReference(r.value);if(dup.length&&!confirm(`${r.type} ${r.value} already exists on another WR. Create this receipt anyway?`))return}catch{}}
    const btn=document.getElementById('wr-create-object');btn.disabled=true;btn.textContent='Creating…';out.textContent='';
    try{const result=await createWarehouseReceiptObject({customer_id:state.customerId||null,description:state.description,references:refs,tree:buildTree()});window.nodaraWROpen?window.nodaraWROpen(result.warehouse_receipt_id):window.nodaraWRList?.()}catch(e){btn.disabled=false;btn.textContent='Create Warehouse Receipt';out.innerHTML=`<span class="warning">${esc(e.message)}</span>`}
  }

  return {start};
}
