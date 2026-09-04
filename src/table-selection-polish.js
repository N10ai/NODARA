import { supabase } from './supabase-client.js';

const selected={rates:new Set(),locations:new Set()};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

function ensureCRHeader(){
 if(window.__nodaraRoute!=='release')return;
 const grid=document.querySelector('#crv2-view .smart-grid');
 const head=grid?.querySelector(':scope > .smart-grid-row.head');
 if(!grid||!head||grid.querySelector(':scope > .smart-grid-select-row.head-wrap'))return;
 const wrap=document.createElement('div');wrap.className='smart-grid-select-row head-wrap';
 const label=document.createElement('label');label.className='grid-select-box';label.innerHTML='<input type="checkbox" aria-label="Select visible cargo releases">';
 head.parentNode.insertBefore(wrap,head);wrap.append(label,head);
 label.querySelector('input').onchange=e=>{
   const checks=[...grid.querySelectorAll('.smart-grid-select-row:not(.head-wrap) .grid-select-box input,.record-select-row .record-select-check input')];
   for(const x of checks){if(x.checked!==e.target.checked){x.checked=e.target.checked;x.dispatchEvent(new Event('change',{bubbles:true}))}}
 };
}
function headWrap(kind,host,head){
 let wrap=host.querySelector(`[data-inline-select-head="${kind}"]`);if(wrap)return wrap;
 wrap=document.createElement('div');wrap.className='record-select-row record-select-head-row';wrap.dataset.inlineSelectHead=kind;
 const label=document.createElement('label');label.className='record-select-check';label.innerHTML='<input type="checkbox" aria-label="Select visible records">';
 head.parentNode.insertBefore(wrap,head);wrap.append(label,head);
 label.querySelector('input').onchange=e=>{const on=e.target.checked;for(const w of host.querySelectorAll(`.record-select-row[data-select-kind="${kind}"]`)){const id=w.dataset.selectId;on?selected[kind].add(id):selected[kind].delete(id)}sync(kind,host)};
 return wrap;
}
function decorate(kind,host,rows,idOf,head){
 for(const row of rows){if(row.closest('.record-select-row'))continue;const id=idOf(row);if(!id)continue;const wrap=document.createElement('div');wrap.className='record-select-row';wrap.dataset.selectKind=kind;wrap.dataset.selectId=id;const box=document.createElement('label');box.className='record-select-check';box.innerHTML=`<input type="checkbox" ${selected[kind].has(id)?'checked':''} aria-label="Select record">`;row.parentNode.insertBefore(wrap,row);wrap.append(box,row)}
 if(head&&!head.closest('.record-select-head-row'))headWrap(kind,host,head);
 if(!host.dataset[`inlineBound${kind}`]){host.dataset[`inlineBound${kind}`]='1';host.addEventListener('click',e=>{if(e.target.closest('.record-select-check'))e.stopPropagation()});host.addEventListener('change',e=>{const x=e.target.closest(`.record-select-row[data-select-kind="${kind}"] .record-select-check input`);if(!x)return;const w=x.closest('.record-select-row'),id=w.dataset.selectId;x.checked?selected[kind].add(id):selected[kind].delete(id);sync(kind,host)})}
 sync(kind,host)
}
function sync(kind,host){const wraps=[...host.querySelectorAll(`.record-select-row[data-select-kind="${kind}"]`)];for(const w of wraps){const on=selected[kind].has(w.dataset.selectId),x=w.querySelector('.record-select-check input');if(x)x.checked=on;w.classList.toggle('selected',on)}const h=host.querySelector(`[data-inline-select-head="${kind}"] input`);if(h){const n=wraps.filter(w=>selected[kind].has(w.dataset.selectId)).length;h.checked=wraps.length>0&&n===wraps.length;h.indeterminate=n>0&&n<wraps.length}}
function enhanceRates(){if(window.__nodaraRoute!=='pricing_rates')return;const list=document.querySelector('.rate-book-section .rate-list');if(!list)return;let head=list.querySelector(':scope > .rate-select-head');if(!head){head=document.createElement('div');head.className='rate-select-head';head.innerHTML='<span>Rate</span>';list.prepend(head)}decorate('rates',list,[...list.querySelectorAll(':scope > .rate-row')],r=>r.dataset.rateService,head)}
function enhanceLocations(){if(!['warehouse_locations','settings_locations'].includes(window.__nodaraRoute))return;const table=document.querySelector('#loc-list .location-table');if(!table)return;const head=table.querySelector(':scope > .location-head');decorate('locations',table,[...table.querySelectorAll(':scope > [data-loc-open]')],r=>r.dataset.locOpen,head)}
function enhance(){ensureCRHeader();enhanceRates();enhanceLocations()}
let lastRoute='';let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;const route=window.__nodaraRoute||'';if(route!==lastRoute){selected.rates.clear();selected.locations.clear();lastRoute=route}enhance()})};new MutationObserver(schedule).observe(document.getElementById('main'),{childList:true,subtree:true});window.addEventListener('nodara:rate-view-changed',schedule);setTimeout(schedule,250);
