import { supabase } from './supabase-client.js';

const selected={rates:new Set(),locations:new Set()};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

/* CR already uses the shared smart-grid/data-view selector. Do not decorate it a second time. */

function inlineSelectAll(kind,host,rows){
 let head=host.querySelector(`[data-inline-select-head="${kind}"]`);
 if(!head){head=document.createElement('label');head.className='record-select-check inline-head-check';head.dataset.inlineSelectHead=kind;head.innerHTML='<input type="checkbox" aria-label="Select visible records">';const first=rows[0];if(first)first.parentNode.insertBefore(head,first);head.querySelector('input').onchange=e=>{const all=e.target.checked;for(const w of host.querySelectorAll(`.record-select-row[data-select-kind="${kind}"]`)){const id=w.dataset.selectId;all?selected[kind].add(id):selected[kind].delete(id)}sync(kind,host)}}
 return head;
}
function decorate(kind,host,rows,idOf){
 for(const row of rows){if(row.closest('.record-select-row'))continue;const id=idOf(row);if(!id)continue;const wrap=document.createElement('div');wrap.className='record-select-row';wrap.dataset.selectKind=kind;wrap.dataset.selectId=id;const box=document.createElement('label');box.className='record-select-check';box.innerHTML=`<input type="checkbox" ${selected[kind].has(id)?'checked':''} aria-label="Select record">`;row.parentNode.insertBefore(wrap,row);wrap.append(box,row)}
 inlineSelectAll(kind,host,[...host.querySelectorAll(`.record-select-row[data-select-kind="${kind}"]`)]);
 if(!host.dataset[`inlineBound${kind}`]){host.dataset[`inlineBound${kind}`]='1';host.addEventListener('click',e=>{if(e.target.closest('.record-select-check'))e.stopPropagation()});host.addEventListener('change',e=>{const x=e.target.closest(`.record-select-row[data-select-kind="${kind}"] .record-select-check input`);if(!x)return;const w=x.closest('.record-select-row'),id=w.dataset.selectId;x.checked?selected[kind].add(id):selected[kind].delete(id);sync(kind,host)})}
 sync(kind,host)
}
function sync(kind,host){const wraps=[...host.querySelectorAll(`.record-select-row[data-select-kind="${kind}"]`)];for(const w of wraps){const on=selected[kind].has(w.dataset.selectId),x=w.querySelector('.record-select-check input');if(x)x.checked=on;w.classList.toggle('selected',on)}const h=host.querySelector(`[data-inline-select-head="${kind}"] input`);if(h){const n=wraps.filter(w=>selected[kind].has(w.dataset.selectId)).length;h.checked=wraps.length>0&&n===wraps.length;h.indeterminate=n>0&&n<wraps.length}}
function enhanceRates(){if(window.__nodaraRoute!=='pricing_rates')return;const list=document.querySelector('.rate-book-section .rate-list');if(!list)return;decorate('rates',list,[...list.querySelectorAll(':scope > .rate-row')],r=>r.dataset.rateService)}
function enhanceLocations(){if(!['warehouse_locations','settings_locations'].includes(window.__nodaraRoute))return;const table=document.querySelector('#loc-list .location-table');if(!table)return;decorate('locations',table,[...table.querySelectorAll(':scope > [data-loc-open]')],r=>r.dataset.locOpen)}
function enhance(){enhanceRates();enhanceLocations()}
let lastRoute='';let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;const route=window.__nodaraRoute||'';if(route!==lastRoute){selected.rates.clear();selected.locations.clear();lastRoute=route}enhance()})};new MutationObserver(schedule).observe(document.getElementById('main'),{childList:true,subtree:true});window.addEventListener('nodara:rate-view-changed',schedule);setTimeout(schedule,250);
