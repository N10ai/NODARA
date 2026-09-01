export const WR_FLAGS = Object.freeze(['DAMAGED','DG','HIGH_VALUE','FRAGILE','DO_NOT_STACK','TEMP_CONTROL','CUSTOMS_HOLD','TSA_CONTROLLED','STA_REQUIRED','BONDED','FTZ']);

export function createWrHeader() {
  return { customer:null, shipper:null, consignee:null, description:'', commodity:'', specialInstructions:'', references:[], flags:[] };
}

export function addReference(header, type, value, source='manual') {
  if (!value?.trim()) return header;
  return { ...header, references:[...header.references,{ type:type.toUpperCase(), value:value.trim(), source }] };
}

export function toggleFlag(header, flag) {
  const flags = new Set(header.flags);
  flags.has(flag) ? flags.delete(flag) : flags.add(flag);
  return { ...header, flags:[...flags] };
}

export function renderWrHeader(container, header, onChange) {
  const refs = header.references.map((r,i)=>`<span class="ref-chip">${esc(r.type)} · ${esc(r.value)} <button data-remove-ref="${i}">×</button></span>`).join('');
  container.innerHTML = `<div class="eyebrow">Warehouse · Receive · Cargo information</div><h1 class="flow-title">What are we receiving?</h1><p class="muted">Operational identity only. Transportation details appear only when relevant to the warehouse.</p><div class="card" style="max-width:760px;margin-top:24px"><div class="row">${field('customer','Customer',header.customer)}${field('shipper','Shipper',header.shipper)}${field('consignee','Consignee',header.consignee)}${field('description','Description',header.description)}${field('commodity','Commodity',header.commodity)}</div><div class="field"><label>Special handling / instructions</label><input data-field="specialInstructions" value="${esc(header.specialInstructions)}"></div><div style="margin-top:18px"><strong>References</strong><div class="ref-list">${refs || '<span class="muted">PO, SO, BOL, PRO, tracking, entry, container…</span>'}</div><div class="row"><div class="field"><label>Type</label><input id="ref-type" placeholder="PO"></div><div class="field"><label>Number</label><input id="ref-value" placeholder="458291"></div></div><button id="add-ref" class="secondary">Add reference</button></div><div style="margin-top:20px"><strong>Flags</strong><div class="flag-grid">${WR_FLAGS.map(f=>`<button class="option ${header.flags.includes(f)?'selected':''}" data-flag="${f}">${f.replaceAll('_',' ')}</button>`).join('')}</div></div></div>`;
  container.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('change',()=>onChange?.({...header,[el.dataset.field]:el.value.trim()})));
  container.querySelector('#add-ref')?.addEventListener('click',()=>onChange?.(addReference(header,container.querySelector('#ref-type').value,container.querySelector('#ref-value').value)));
  container.querySelectorAll('[data-flag]').forEach(el=>el.addEventListener('click',()=>onChange?.(toggleFlag(header,el.dataset.flag))));
  container.querySelectorAll('[data-remove-ref]').forEach(el=>el.addEventListener('click',()=>onChange?.({...header,references:header.references.filter((_,i)=>i!==Number(el.dataset.removeRef))})));
}
function field(id,label,value=''){return `<div class="field"><label>${label}</label><input data-field="${id}" value="${esc(value||'')}"></div>`}function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
