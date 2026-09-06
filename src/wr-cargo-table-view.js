const main=document.getElementById('main');
let activeBranch=null,installing=false,lastSignature='';

const style=document.createElement('style');
style.textContent=`
.wr-cargo-list-shell{margin-top:14px}.wr-cargo-list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px}.wr-cargo-list-head>div{min-width:0}.wr-cargo-list-head h4{margin:0;font-size:14px}.wr-cargo-list-head small{display:block;color:var(--muted);margin-top:2px}.wr-cargo-table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px}.wr-cargo-table{width:100%;border-collapse:collapse;min-width:880px}.wr-cargo-table th{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);text-align:left;padding:9px 11px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel,#10141c) 92%,transparent)}.wr-cargo-table td{padding:10px 11px;border-bottom:1px solid color-mix(in srgb,var(--border) 75%,transparent);font-size:12px;vertical-align:middle}.wr-cargo-table tr:last-child td{border-bottom:0}.wr-cargo-row-main{display:flex;flex-direction:column;gap:2px;min-width:180px}.wr-cargo-row-main b{font-size:12px}.wr-cargo-row-main small{color:var(--muted)}.wr-cargo-row-actions{display:flex;gap:6px;justify-content:flex-end}.wr-cargo-empty{padding:22px;text-align:center;color:var(--muted)}.wr-cargo-editor-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0 12px;padding:10px 0;border-bottom:1px solid var(--border)}.wr-cargo-editor-head>div{min-width:0}.wr-cargo-editor-head h4{margin:0;font-size:14px}.wr-cargo-editor-head small{display:block;color:var(--muted);margin-top:2px}.cargo-hierarchy-v3[data-table-editor-open="1"] .cargo-root-list{display:block}.cargo-hierarchy-v3[data-table-editor-open="1"] .cargo-root-branch{display:none}.cargo-hierarchy-v3[data-table-editor-open="1"] .cargo-root-branch[data-table-active="1"]{display:block}.cargo-hierarchy-v3:not([data-table-editor-open="1"]) .cargo-root-list{display:none}.cargo-hierarchy-v3:not([data-table-editor-open="1"]) #cv3-add-root{display:none}@media(max-width:760px){.wr-cargo-list-head,.wr-cargo-editor-head{align-items:flex-start;flex-direction:column}.wr-cargo-list-head .primary,.wr-cargo-editor-head .primary{width:100%}}
`;
document.head.appendChild(style);

const text=v=>String(v??'').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const fmt=v=>{const n=num(v);return n?Number(n.toFixed(3)).toLocaleString():'—'};
function branches(h){return [...h.querySelectorAll(':scope > .cargo-root-list > .cargo-root-branch')]}
function rootCard(branch){return branch?.querySelector(':scope > .cargo-tree-node')||branch?.querySelector('.cargo-tree-node')||null}
function field(card,suffix){return card?.querySelector(`[id$="-${suffix}"]`)||null}
function rootData(branch,index){
  const card=rootCard(branch),children=[...branch.querySelectorAll('.cargo-child-node')];
  const types=children.map(c=>field(c,'type')?.value).filter(Boolean);
  const unique=[...new Set(types)];
  const contents=children.length?`${children.length} nested ${children.length===1?'level/item':'levels/items'}${unique.length?` · ${unique.slice(0,3).join(', ')}`:''}`:'No nested contents';
  const part=text(field(card,'part')?.value),sku=text(field(card,'sku')?.value),desc=text(field(card,'desc')?.value),barcode=text(field(card,'barcode')?.value);
  const label=part||sku||desc||`${text(field(card,'type')?.value)||'Cargo'} ${index+1}`;
  const secondary=[sku&&sku!==label?sku:null,desc&&desc!==label?desc:null,barcode].filter(Boolean).join(' · ');
  const dims=[field(card,'l')?.value,field(card,'w')?.value,field(card,'h')?.value].map(text);
  const dimUnit=document.getElementById('cv3-dim-unit')?.value||'IN',weightUnit=document.getElementById('cv3-weight-unit')?.value||'KG';
  return{label,secondary,type:text(field(card,'type')?.value)||'—',qty:text(field(card,'qty')?.value)||'1',contents,weight:field(card,'weight')?.value?`${fmt(field(card,'weight')?.value)} ${weightUnit}`:'—',dims:dims.every(Boolean)?`${dims.join(' × ')} ${dimUnit}`:'—',location:text(field(card,'location')?.value)||'—',condition:text(field(card,'condition')?.value)||'GOOD'};
}
function signature(h){return branches(h).map((b,i)=>JSON.stringify(rootData(b,i))).join('|')+`|${activeBranch?branches(h).indexOf(activeBranch):-1}`}
function closeEditor(h){activeBranch=null;h.dataset.tableEditorOpen='0';branches(h).forEach(b=>delete b.dataset.tableActive);renderList(h)}
function openEditor(h,branch){activeBranch=branch;h.dataset.tableEditorOpen='1';branches(h).forEach(b=>b.dataset.tableActive=b===branch?'1':'0');renderEditorHeader(h,branch)}
function renderEditorHeader(h,branch){
  h.querySelector('.wr-cargo-editor-head')?.remove();
  const d=rootData(branch,Math.max(0,branches(h).indexOf(branch)));
  const head=document.createElement('div');head.className='wr-cargo-editor-head';
  head.innerHTML=`<div><span class="cargo-node-eyebrow">CARGO EDITOR</span><h4>${d.label}</h4><small>Edit packaging, quantities, nested contents, identifiers, dimensions, location and condition.</small></div><button type="button" class="primary compact-btn" data-cargo-editor-done>Done</button>`;
  h.querySelector('.cargo-root-list')?.insertAdjacentElement('beforebegin',head);
  head.querySelector('[data-cargo-editor-done]').onclick=()=>closeEditor(h);
}
function renderList(h){
  h.querySelector('.wr-cargo-editor-head')?.remove();
  let shell=h.querySelector('.wr-cargo-list-shell');if(!shell){shell=document.createElement('div');shell.className='wr-cargo-list-shell';h.querySelector('.cargo-root-list')?.insertAdjacentElement('beforebegin',shell)}
  const rows=branches(h);
  shell.style.display=h.dataset.tableEditorOpen==='1'?'none':'';
  shell.innerHTML=`<div class="wr-cargo-list-head"><div><span class="cargo-node-eyebrow">CARGO / ITEMS</span><h4>${rows.length} line${rows.length===1?'':'s'}</h4><small>Click a line to open the full cargo editor.</small></div><button type="button" class="primary compact-btn" data-table-add-item>＋ Add item</button></div>${rows.length?`<div class="wr-cargo-table-wrap"><table class="wr-cargo-table"><thead><tr><th>Item / cargo</th><th>Package</th><th>Qty</th><th>Contents</th><th>Weight / pc</th><th>Dimensions</th><th>Location</th><th>Condition</th><th></th></tr></thead><tbody>${rows.map((b,i)=>{const d=rootData(b,i);return `<tr data-table-cargo-row="${i}"><td><div class="wr-cargo-row-main"><b>${escapeHtml(d.label)}</b><small>${escapeHtml(d.secondary||'Cargo line')}</small></div></td><td>${escapeHtml(d.type)}</td><td>${escapeHtml(d.qty)}</td><td>${escapeHtml(d.contents)}</td><td>${escapeHtml(d.weight)}</td><td>${escapeHtml(d.dims)}</td><td>${escapeHtml(d.location)}</td><td>${escapeHtml(d.condition)}</td><td><div class="wr-cargo-row-actions"><button type="button" class="subtle compact-btn" data-table-edit="${i}">Edit</button><button type="button" class="subtle compact-btn" data-table-copy="${i}">Duplicate</button>${rows.length>1?`<button type="button" class="subtle compact-btn" data-table-remove="${i}">Remove</button>`:''}</div></td></tr>`}).join('')}</tbody></table></div>`:'<div class="wr-cargo-empty">No cargo lines yet. Add an item to begin receiving.</div>'}`;
  shell.querySelector('[data-table-add-item]').onclick=()=>{
    const before=branches(h).length;document.getElementById('cv3-add-root')?.click();setTimeout(()=>{const next=branches(h);const b=next[Math.min(before,next.length-1)]||next.at(-1);if(b)openEditor(h,b)},40);
  };
  shell.querySelectorAll('[data-table-edit]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const b=branches(h)[Number(btn.dataset.tableEdit)];if(b)openEditor(h,b)});
  shell.querySelectorAll('[data-table-copy]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const b=branches(h)[Number(btn.dataset.tableCopy)];const copy=b?.querySelector('[data-duplicate-root]');if(copy){copy.click();setTimeout(()=>renderList(h),60)}});
  shell.querySelectorAll('[data-table-remove]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const b=branches(h)[Number(btn.dataset.tableRemove)];b?.querySelector('[data-remove-root]')?.click();setTimeout(()=>renderList(h),30)});
  shell.querySelectorAll('[data-table-cargo-row]').forEach(row=>row.onclick=e=>{if(e.target.closest('button'))return;const b=branches(h)[Number(row.dataset.tableCargoRow)];if(b)openEditor(h,b)});
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function install(){
  if(installing)return;const h=document.querySelector('.cargo-hierarchy-v3');if(!h)return;installing=true;
  try{
    if(h.dataset.tableViewInstalled!=='1'){h.dataset.tableViewInstalled='1';h.dataset.tableEditorOpen='0';}
    const current=branches(h);
    if(activeBranch&&!current.includes(activeBranch))activeBranch=null;
    if(activeBranch){h.dataset.tableEditorOpen='1';current.forEach(b=>b.dataset.tableActive=b===activeBranch?'1':'0');renderEditorHeader(h,activeBranch)}else{h.dataset.tableEditorOpen='0';current.forEach(b=>delete b.dataset.tableActive);const sig=signature(h);if(sig!==lastSignature||!h.querySelector('.wr-cargo-list-shell')){lastSignature=sig;renderList(h)}}
  }finally{installing=false}
}
new MutationObserver(()=>requestAnimationFrame(install)).observe(main,{childList:true,subtree:true});
main.addEventListener('input',e=>{if(e.target.closest('.cargo-hierarchy-v3'))setTimeout(()=>{const h=document.querySelector('.cargo-hierarchy-v3');if(h&&!activeBranch)renderList(h)},20)});
main.addEventListener('change',e=>{if(e.target.closest('.cargo-hierarchy-v3'))setTimeout(()=>{const h=document.querySelector('.cargo-hierarchy-v3');if(h&&!activeBranch)renderList(h)},20)});
setTimeout(install,450);
