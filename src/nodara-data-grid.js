// NODARA reusable operational data grid.
// Column definitions may point to base-table fields or safe related/view fields.
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export function renderDataGrid({id,rows=[],columns=[],defaultColumns=[],onOpen}){
 const key='nodara:grid:'+id+':columns';
 let visible;try{visible=JSON.parse(localStorage.getItem(key)||'null')}catch{}
 visible=(Array.isArray(visible)&&visible.length?visible:defaultColumns).filter(k=>columns.some(c=>c.key===k));
 const host=document.createElement('div');host.className='nd-grid';host.innerHTML=`
 <div class="nd-grid-tools"><div class="nd-grid-search"><input data-grid-search placeholder="Filter records…"></div><button class="secondary" data-grid-columns>Columns</button></div>
 <div class="nd-grid-columns" hidden>${columns.map(c=>`<label><input type="checkbox" value="${esc(c.key)}" ${visible.includes(c.key)?'checked':''}> ${esc(c.label)}</label>`).join('')}<button class="primary" data-grid-apply>Apply</button></div>
 <div class="nd-grid-scroll"><table><thead><tr>${visible.map(k=>`<th>${esc(columns.find(c=>c.key===k)?.label||k)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
 const body=host.querySelector('tbody'),search=host.querySelector('[data-grid-search]');
 const draw=()=>{const q=search.value.trim().toLowerCase();const filtered=rows.filter(r=>!q||visible.some(k=>String(r[k]??'').toLowerCase().includes(q)));body.innerHTML=filtered.length?filtered.map(r=>`<tr data-row="${esc(r.id)}">${visible.map(k=>{const c=columns.find(x=>x.key===k),v=r[k];return `<td data-label="${esc(c?.label||k)}">${c?.render?c.render(v,r):esc(v??'—')}</td>`}).join('')}</tr>`).join(''):`<tr><td colspan="${Math.max(visible.length,1)}" class="empty">No matching records.</td></tr>`;body.querySelectorAll('[data-row]').forEach(tr=>tr.onclick=()=>onOpen?.(tr.dataset.row))};
 search.oninput=draw;host.querySelector('[data-grid-columns]').onclick=()=>{const p=host.querySelector('.nd-grid-columns');p.hidden=!p.hidden};host.querySelector('[data-grid-apply]').onclick=()=>{visible=[...host.querySelectorAll('.nd-grid-columns input:checked')].map(x=>x.value);if(!visible.length)return;localStorage.setItem(key,JSON.stringify(visible));renderInto(host.parentElement,{id,rows,columns,defaultColumns:visible,onOpen})};draw();return host;
}
export function renderInto(container,opts){container.replaceChildren(renderDataGrid(opts))}
