import { getOptionSet } from './configurable-options.js';

const main=document.getElementById('main');
const FLAGS=getOptionSet('operational_flags');
const UOMS=getOptionSet('units');
const CONDITIONS=getOptionSet('conditions');
const state={
  showInner:false,
  showItems:false,
  weightUnit:'LB',
  dimensionUnit:'IN',
  volumeDivisor:139,
  advanced:{outer:false,inner:false},
  packages:{
    outer:{description:'',uom:'PLT',weight_lb:'',length_in:'',width_in:'',height_in:'',location:'',condition:'GOOD',flags:[]},
    inner:{description:'',uom:'CTN',weight_lb:'',length_in:'',width_in:'',height_in:'',location:'',condition:'GOOD',flags:[]}
  },
  items:[]
};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v||0);
const kg=v=>num(v)*0.45359237;
const lb=v=>num(v)/0.45359237;
const cm=v=>num(v)*2.54;
const inch=v=>num(v)/2.54;
const weightDisplay=v=>v===''||v==null?'':(state.weightUnit==='KG'?kg(v):num(v)).toFixed(3).replace(/\.?0+$/,'');
const weightParse=v=>v===''?'':state.weightUnit==='KG'?lb(v):num(v);
const dimDisplay=v=>v===''||v==null?'':(state.dimensionUnit==='CM'?cm(v):num(v)).toFixed(2).replace(/\.?0+$/,'');
const dimParse=v=>v===''?'':state.dimensionUnit==='CM'?inch(v):num(v);

function optionMarkup(values,value){return values.map(x=>`<option value="${esc(x)}" ${String(x)===String(value)?'selected':''}>${esc(String(x).replaceAll('_',' '))}</option>`).join('')}
function typeOptions(original,value){return [...original.options].filter(o=>o.value).map(o=>`<option value="${esc(o.value)}" ${o.value===value?'selected':''}>${esc(o.textContent)}</option>`).join('')}
function flags(scope,selected=[]){return `<div class="line-flag-grid">${FLAGS.map(f=>`<button type="button" class="line-flag ${selected.includes(f)?'selected':''}" data-hflag-scope="${scope}" data-hflag="${f}">${esc(f.replaceAll('_',' '))}</button>`).join('')}</div>`}

function readOriginal(cargo){
  const outerType=cargo.querySelector('#outer-type'),outerQty=cargo.querySelector('#outer-qty'),innerType=cargo.querySelector('#inner-type'),innerQty=cargo.querySelector('#inner-qty');
  return {outerType,outerQty,innerType,innerQty};
}
function setOriginal(el,value){if(!el)return;el.value=String(value??'');el.dispatchEvent(new Event('change',{bubbles:true}))}

function syncLevel(key){
  const d=state.packages[key],get=id=>document.getElementById(id);
  d.description=get(`hv3-${key}-desc`)?.value??d.description;
  d.uom=get(`hv3-${key}-uom`)?.value||d.uom;
  const w=get(`hv3-${key}-weight`)?.value;if(w!==undefined)d.weight_lb=weightParse(w);
  const l=get(`hv3-${key}-l`)?.value,wi=get(`hv3-${key}-w`)?.value,h=get(`hv3-${key}-h`)?.value;
  if(l!==undefined)d.length_in=dimParse(l);if(wi!==undefined)d.width_in=dimParse(wi);if(h!==undefined)d.height_in=dimParse(h);
  d.location=get(`hv3-${key}-location`)?.value??d.location;
  d.condition=get(`hv3-${key}-condition`)?.value||d.condition;
}
function syncItems(cargo){
  cargo.querySelectorAll('.item-object').forEach(obj=>{
    const q=obj.querySelector('[data-item-qty]');if(!q)return;
    const i=Number(q.dataset.itemQty),d=state.items[i]||(state.items[i]={description:'',uom:'EA',weight_lb:'',length_in:'',width_in:'',height_in:'',condition:'GOOD',flags:[]}),get=id=>document.getElementById(id);
    d.description=get(`hv3-item-${i}-desc`)?.value??d.description;
    d.uom=get(`hv3-item-${i}-uom`)?.value||d.uom;
    const w=get(`hv3-item-${i}-weight`)?.value,l=get(`hv3-item-${i}-l`)?.value,wi=get(`hv3-item-${i}-w`)?.value,h=get(`hv3-item-${i}-h`)?.value;
    if(w!==undefined)d.weight_lb=weightParse(w);if(l!==undefined)d.length_in=dimParse(l);if(wi!==undefined)d.width_in=dimParse(wi);if(h!==undefined)d.height_in=dimParse(h);
  });
}

function levelCard(key,number,title,typeSelect,qtyInput){
  const d=state.packages[key],adv=state.advanced[key],typeValue=typeSelect?.value||(key==='outer'?'PALLET':'BOX'),qtyValue=qtyInput?.value||(key==='outer'?1:1),qtyLabel=key==='outer'?'Quantity received':'Qty per parent';
  return `<article class="cargo-tree-node" data-level="${key}">
    <div class="cargo-node-marker">${number}</div>
    <div class="cargo-node-body">
      <div class="cargo-node-head"><div><span class="cargo-node-eyebrow">${key==='outer'?'RECEIVED LEVEL':'NESTED LEVEL'}</span><h4>${esc(title)}</h4></div><button type="button" class="subtle compact-btn" data-level-more="${key}">${adv?'Less':'More'}</button></div>
      <div class="cargo-node-grid primary">
        <div class="field"><label>Package type</label><select id="hv3-${key}-type">${typeOptions(typeSelect,typeValue)}</select></div>
        <div class="field"><label>${qtyLabel}</label><input id="hv3-${key}-qty" type="number" min="1" step="1" value="${esc(qtyValue)}"></div>
        <div class="field cargo-desc"><label>Description / commodity</label><input id="hv3-${key}-desc" value="${esc(d.description)}" placeholder="Optional description"></div>
      </div>
      <div class="cargo-node-grid measures">
        <div class="field"><label>Piece unit</label><select id="hv3-${key}-uom">${optionMarkup(UOMS,d.uom)}</select></div>
        <div class="field"><label>Weight / piece (${state.weightUnit})</label><input id="hv3-${key}-weight" inputmode="decimal" type="number" min="0" step="any" value="${esc(weightDisplay(d.weight_lb))}" placeholder="0"></div>
        <div class="field dims-field"><label>Dimensions (${state.dimensionUnit})</label><div class="dims-inline"><input id="hv3-${key}-l" inputmode="decimal" type="number" min="0" step="any" value="${esc(dimDisplay(d.length_in))}" placeholder="L"><span>×</span><input id="hv3-${key}-w" inputmode="decimal" type="number" min="0" step="any" value="${esc(dimDisplay(d.width_in))}" placeholder="W"><span>×</span><input id="hv3-${key}-h" inputmode="decimal" type="number" min="0" step="any" value="${esc(dimDisplay(d.height_in))}" placeholder="H"></div></div>
      </div>
      ${adv?`<div class="cargo-node-advanced"><div class="field"><label>Location</label><input id="hv3-${key}-location" value="${esc(d.location)}"></div><div class="field"><label>Condition</label><select id="hv3-${key}-condition">${optionMarkup(CONDITIONS,d.condition)}</select></div><div class="field flags-field"><label>Flags</label>${flags(key,d.flags)}</div></div>`:''}
    </div>
  </article>`;
}

function itemDetails(cargo){
  if(!state.showItems)return'';
  const itemBuilder=cargo.querySelector('.item-builder');
  if(!itemBuilder)return'';
  return `<div class="cargo-tree-connector"><span></span><b>contains</b></div><div class="cargo-items-shell"><div class="cargo-items-heading"><div><span class="cargo-node-eyebrow">ITEM CONTENTS</span><h4>Parts / SKUs / serials</h4></div></div><div id="hv3-item-slot"></div></div>`;
}

function itemPanel(i){
  const d=state.items[i]||(state.items[i]={description:'',uom:'EA',weight_lb:'',length_in:'',width_in:'',height_in:'',condition:'GOOD',flags:[]});
  return `<div class="cargo-line-details compact-item-detail" data-hv3-item="${i}"><div class="cargo-node-grid measures"><div class="field"><label>Description</label><input id="hv3-item-${i}-desc" value="${esc(d.description)}"></div><div class="field"><label>Unit</label><select id="hv3-item-${i}-uom">${optionMarkup(UOMS,d.uom)}</select></div><div class="field"><label>Weight / unit (${state.weightUnit})</label><input id="hv3-item-${i}-weight" inputmode="decimal" type="number" min="0" step="any" value="${esc(weightDisplay(d.weight_lb))}"></div><div class="field dims-field"><label>Dimensions (${state.dimensionUnit})</label><div class="dims-inline"><input id="hv3-item-${i}-l" inputmode="decimal" type="number" min="0" step="any" value="${esc(dimDisplay(d.length_in))}" placeholder="L"><span>×</span><input id="hv3-item-${i}-w" inputmode="decimal" type="number" min="0" step="any" value="${esc(dimDisplay(d.width_in))}" placeholder="W"><span>×</span><input id="hv3-item-${i}-h" inputmode="decimal" type="number" min="0" step="any" value="${esc(dimDisplay(d.height_in))}" placeholder="H"></div></div></div></div>`;
}

function totals(cargo){
  syncLevel('outer');if(state.showInner)syncLevel('inner');syncItems(cargo);
  const {outerQty,innerQty}=readOriginal(cargo),oq=Math.max(0,num(outerQty?.value)),iq=state.showInner?Math.max(0,num(innerQty?.value)):0,innerTotal=oq*iq,od=state.packages.outer,id=state.packages.inner;
  const ocube=num(od.length_in)*num(od.width_in)*num(od.height_in),icube=num(id.length_in)*num(id.width_in)*num(id.height_in);
  let gross=num(od.weight_lb)>0?num(od.weight_lb)*oq:(num(id.weight_lb)>0?num(id.weight_lb)*innerTotal:0),cubicIn=ocube>0?ocube*oq:(icube>0?icube*innerTotal:0),unitCount=0;
  state.items.forEach((d,i)=>{const per=num(cargo.querySelector(`[data-item-qty="${i}"]`)?.value),mult=state.showInner?innerTotal:(oq||1);unitCount+=per*mult;if(!gross)gross+=num(d.weight_lb)*per*mult});
  const cbm=cubicIn/61023.744,cft=cubicIn/1728,volumetric=cubicIn/state.volumeDivisor,chargeable=Math.max(gross,volumetric);
  return{outerQty:oq,innerTotal,unitCount,gross,grossKg:kg(gross),cbm,cft,volumetric,volumetricKg:kg(volumetric),chargeable,chargeableKg:kg(chargeable),outerUom:od.uom,innerUom:id.uom};
}
function normalize(d){return{description:d.description||null,uom:d.uom||null,weight_lb:d.weight_lb===''?null:num(d.weight_lb),length_in:d.length_in===''?null:num(d.length_in),width_in:d.width_in===''?null:num(d.width_in),height_in:d.height_in===''?null:num(d.height_in),location:d.location||null,condition:d.condition||'GOOD',flags:[...(d.flags||[])]}}
function ensureSummary(t){
  const aside=document.querySelector('.wr-draft-summary');if(!aside)return;
  let box=aside.querySelector('.wr-live-cargo-summary');if(!box){box=document.createElement('div');box.className='wr-live-cargo-summary';aside.appendChild(box)}
  box.innerHTML=`<div class="summary-divider"></div><div class="eyebrow">Cargo totals</div><div class="summary-line"><span>Received pieces</span><b>${t.outerQty} ${esc(t.outerUom||'')}</b></div>${state.showInner?`<div class="summary-line"><span>Contained packages</span><b>${t.innerTotal} ${esc(t.innerUom||'')}</b></div>`:''}${t.unitCount?`<div class="summary-line"><span>Tracked units</span><b>${t.unitCount}</b></div>`:''}<div class="summary-line"><span>Gross weight</span><b>${t.gross?t.gross.toFixed(2):'—'} lb · ${t.gross?t.grossKg.toFixed(2):'—'} kg</b></div><div class="summary-line"><span>Volume</span><b>${t.cbm?t.cbm.toFixed(3):'—'} CBM · ${t.cft?t.cft.toFixed(2):'—'} ft³</b></div><div class="summary-line"><span>Volumetric</span><b>${t.volumetric?t.volumetric.toFixed(2):'—'} lb · ${t.volumetric?t.volumetricKg.toFixed(2):'—'} kg</b></div><div class="summary-line summary-accent"><span>Chargeable</span><b>${t.chargeable?t.chargeable.toFixed(2):'—'} lb · ${t.chargeable?t.chargeableKg.toFixed(2):'—'} kg</b></div>`;
}
function publish(cargo){
  syncLevel('outer');if(state.showInner)syncLevel('inner');syncItems(cargo);
  const {outerType,innerType}=readOriginal(cargo),packages={[String(outerType?.value||'PALLET').toUpperCase()]:normalize(state.packages.outer)};
  if(state.showInner)packages[String(innerType?.value||'BOX').toUpperCase()]=normalize(state.packages.inner);
  const t=totals(cargo);
  window.__nodaraCargoDraftDetails={packages,items:state.items.map(normalize),itemCursor:0,measurement_units:{weight:state.weightUnit,dimensions:state.dimensionUnit},totals:t};
  ensureSummary(t);window.dispatchEvent(new CustomEvent('nodara:cargo-totals',{detail:t}));
}

function syncVisibleToOriginal(cargo){
  const o=readOriginal(cargo);
  const ot=document.getElementById('hv3-outer-type'),oq=document.getElementById('hv3-outer-qty');
  if(ot&&o.outerType)o.outerType.value=ot.value;if(oq&&o.outerQty)o.outerQty.value=oq.value;
  const it=document.getElementById('hv3-inner-type'),iq=document.getElementById('hv3-inner-qty');
  if(it&&o.innerType)o.innerType.value=it.value;if(iq&&o.innerQty)o.innerQty.value=iq.value;
}
function bindStable(cargo){
  cargo.querySelectorAll('.cargo-hierarchy-v3 input,.cargo-hierarchy-v3 select').forEach(el=>{
    el.addEventListener('input',()=>{syncVisibleToOriginal(cargo);publish(cargo)});
    el.addEventListener('change',()=>{syncVisibleToOriginal(cargo);publish(cargo)});
  });
  cargo.querySelectorAll('[data-hflag]').forEach(b=>b.onclick=()=>{const scope=b.dataset.hflagScope,flag=b.dataset.hflag,d=state.packages[scope];d.flags=d.flags||[];d.flags=d.flags.includes(flag)?d.flags.filter(x=>x!==flag):[...d.flags,flag];b.classList.toggle('selected');publish(cargo)});
  cargo.querySelectorAll('[data-level-more]').forEach(b=>b.onclick=()=>{publish(cargo);state.advanced[b.dataset.levelMore]=!state.advanced[b.dataset.levelMore];renderHierarchy(cargo)});
  document.getElementById('hv3-weight-unit')?.addEventListener('change',e=>{publish(cargo);state.weightUnit=e.target.value;renderHierarchy(cargo)});
  document.getElementById('hv3-dim-unit')?.addEventListener('change',e=>{publish(cargo);state.dimensionUnit=e.target.value;renderHierarchy(cargo)});
  document.getElementById('hv3-add-contents')?.addEventListener('click',()=>{publish(cargo);state.showInner=true;const o=readOriginal(cargo);if(o.innerType&&!o.innerType.value)o.innerType.value='BOX';if(o.innerQty&&!num(o.innerQty.value))o.innerQty.value='1';renderHierarchy(cargo)});
  document.getElementById('hv3-remove-inner')?.addEventListener('click',()=>{publish(cargo);state.showInner=false;const o=readOriginal(cargo);if(o.innerType)o.innerType.value='';if(o.innerQty)o.innerQty.value='0';renderHierarchy(cargo)});
  document.getElementById('hv3-track-items')?.addEventListener('click',()=>{publish(cargo);state.showItems=true;renderHierarchy(cargo)});
  document.getElementById('hv3-hide-items')?.addEventListener('click',()=>{publish(cargo);state.showItems=false;renderHierarchy(cargo)});
}
function moveItemBuilder(cargo,host){
  const itemBuilder=cargo.querySelector('.item-builder');if(!itemBuilder)return;
  const slot=host.querySelector('#hv3-item-slot');
  if(state.showItems&&slot){itemBuilder.style.display='block';slot.appendChild(itemBuilder);cargo.querySelectorAll('.item-object').forEach(obj=>{const q=obj.querySelector('[data-item-qty]');if(!q)return;const i=Number(q.dataset.itemQty);if(!obj.querySelector(`[data-hv3-item="${i}"]`))obj.insertAdjacentHTML('beforeend',itemPanel(i))})}else itemBuilder.style.display='none';
}
function renderHierarchy(cargo){
  syncLevel('outer');if(state.showInner)syncLevel('inner');syncItems(cargo);
  const original=readOriginal(cargo);let host=cargo.querySelector('.cargo-hierarchy-v3');if(!host)return;
  host.innerHTML=`<div class="cargo-hierarchy-toolbar"><div><span class="cargo-node-eyebrow">CARGO HIERARCHY</span><b>Build only the levels you actually received</b></div><div class="cargo-global-units"><label>Weight <select id="hv3-weight-unit"><option ${state.weightUnit==='LB'?'selected':''}>LB</option><option ${state.weightUnit==='KG'?'selected':''}>KG</option></select></label><label>Dims <select id="hv3-dim-unit"><option ${state.dimensionUnit==='IN'?'selected':''}>IN</option><option ${state.dimensionUnit==='CM'?'selected':''}>CM</option></select></label></div></div>
    <div class="cargo-tree">${levelCard('outer',1,'Received cargo',original.outerType,original.outerQty)}
      ${state.showInner?`<div class="cargo-tree-connector"><span></span><b>contains</b></div>${levelCard('inner',2,'Contents inside each received piece',original.innerType,original.innerQty)}<div class="cargo-node-actions"><button type="button" class="subtle" id="hv3-remove-inner">Remove this layer</button>${!state.showItems?'<button type="button" class="secondary" id="hv3-track-items">＋ Track items / SKUs inside</button>':'<button type="button" class="subtle" id="hv3-hide-items">Hide item tracking</button>'}</div>`:`<div class="cargo-tree-add"><span class="cargo-add-line"></span><div><b>Need to track what is inside?</b><small>Add another physical level only when it matters.</small></div><button type="button" class="secondary" id="hv3-add-contents">＋ Add contents</button>${!state.showItems?'<button type="button" class="subtle" id="hv3-track-items">Track items / SKUs directly</button>':''}</div>`}
      ${itemDetails(cargo)}
    </div>`;
  moveItemBuilder(cargo,host);bindStable(cargo);publish(cargo);
}

function install(){
  const cargo=document.getElementById('cargo');if(!cargo||!main.querySelector('.wr-object-head'))return;
  const originalRow=cargo.querySelector('.cargo-builder-row');if(!originalRow)return;
  originalRow.style.display='none';
  const mode=cargo.querySelector('.mode-switch');if(mode)mode.style.display='none';
  let host=cargo.querySelector('.cargo-hierarchy-v3');
  if(!host){host=document.createElement('div');host.className='cargo-hierarchy-v3';originalRow.insertAdjacentElement('afterend',host)}
  renderHierarchy(cargo);
  const save=document.getElementById('wr-save');if(save&&!save.dataset.hv3Capture){save.dataset.hv3Capture='1';save.addEventListener('click',()=>{syncVisibleToOriginal(cargo);publish(cargo)},true)}
}

// Only reinstall when the WR editor itself is replaced. Summary/input DOM changes do not rebuild the hierarchy.
const observer=new MutationObserver(()=>{const cargo=document.getElementById('cargo');if(cargo&&main.querySelector('.wr-object-head')&&!cargo.querySelector('.cargo-hierarchy-v3'))requestAnimationFrame(install)});
observer.observe(main,{childList:true,subtree:false});
setTimeout(install,250);
