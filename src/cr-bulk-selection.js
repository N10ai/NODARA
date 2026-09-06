import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
let selected=new Set();

const style=document.createElement('style');
style.textContent=`
.cr-bulk-toolbar{display:flex;align-items:center;gap:8px;margin:10px 0}.cr-bulk-count{margin-left:auto;color:var(--muted);font-size:11px}.cr-select-cell{display:grid;place-items:center}.cr-select-box{width:16px;height:16px;accent-color:var(--accent,#8bb8ff)}.location-row.cr-selectable{grid-template-columns:34px minmax(130px,1.1fr) minmax(130px,1fr) minmax(120px,1fr) minmax(130px,1fr) minmax(90px,.7fr) 28px}.location-row.cr-selectable.selected{background:rgba(110,155,220,.08)}
`;
document.head.appendChild(style);

function isCRList(){return /Cargo Releases/i.test(main.querySelector('h1.title')?.textContent||'')&&main.querySelector('[data-cr]')}
function ids(){return [...main.querySelectorAll('[data-cr]')].map(x=>x.dataset.cr).filter(Boolean)}
function refreshToolbar(){const count=document.querySelector('.cr-bulk-count');if(count)count.textContent=`${selected.size} selected`;document.querySelectorAll('[data-cr]').forEach(row=>row.classList.toggle('selected',selected.has(row.dataset.cr)))}
async function deleteSelected(){if(!selected.size)return;const n=selected.size;if(!confirm(`Delete ${n} selected Cargo Release${n===1?'':'s'}? This cannot be undone.`))return;const failures=[];let deleted=0;for(const id of [...selected]){const{error}=await supabase.from('cargo_releases').delete().eq('id',id);if(error)failures.push({id,error:error.message});else{deleted++;selected.delete(id)}}if(failures.length)alert(`${deleted} deleted. ${failures.length} could not be deleted because they are still referenced by operational history.`);window.nodaraRelease?.()}
function install(){if(!isCRList()||main.querySelector('.cr-bulk-toolbar'))return;selected=new Set();const context=main.querySelector('.context-bar');const toolbar=document.createElement('div');toolbar.className='cr-bulk-toolbar';toolbar.innerHTML=`<button class="secondary compact-btn" data-cr-select-all>Select all</button><button class="secondary compact-btn" data-cr-clear>Clear</button><button class="danger-btn compact-btn" data-cr-delete-selected disabled>Delete selected</button><span class="cr-bulk-count">0 selected</span>`;(context||main.querySelector('.location-kpis'))?.insertAdjacentElement('afterend',toolbar);toolbar.querySelector('[data-cr-select-all]').onclick=()=>{ids().forEach(id=>selected.add(id));sync()};toolbar.querySelector('[data-cr-clear]').onclick=()=>{selected.clear();sync()};toolbar.querySelector('[data-cr-delete-selected]').onclick=deleteSelected;
 for(const row of main.querySelectorAll('[data-cr]')){row.classList.add('cr-selectable');const cell=document.createElement('span');cell.className='cr-select-cell';cell.innerHTML=`<input class="cr-select-box" type="checkbox" aria-label="Select Cargo Release">`;row.insertBefore(cell,row.firstChild);const box=cell.querySelector('input');box.onclick=e=>{e.stopPropagation()};box.onchange=()=>{box.checked?selected.add(row.dataset.cr):selected.delete(row.dataset.cr);sync()}}
 sync()}
function sync(){for(const row of main.querySelectorAll('[data-cr]')){const box=row.querySelector('.cr-select-box');if(box)box.checked=selected.has(row.dataset.cr)}const del=document.querySelector('[data-cr-delete-selected]');if(del)del.disabled=!selected.size;refreshToolbar()}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install()})}).observe(main,{childList:true,subtree:true});setTimeout(install,400);
