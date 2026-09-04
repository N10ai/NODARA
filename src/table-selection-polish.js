import { supabase } from './supabase-client.js';

const selected={release:new Set(),rates:new Set(),locations:new Set()};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function ensureBar(kind,host,actions,{selectVisible=false}={}){
  let bar=host.querySelector(`[data-select-bar="${kind}"]`);
  if(bar)return bar;
  bar=document.createElement('div');bar.className='record-select-bar';bar.dataset.selectBar=kind;bar.hidden=true;
  bar.innerHTML=`<div><b data-select-count>0 selected</b><small>${kind==='rates'?'Select several rates and run one action on all of them.':'Select records, then act without opening each one.'}</small></div><div class="record-select-actions">${selectVisible?'<button class="secondary compact-btn" data-select-visible>Select visible</button>':''}${actions.map((a,i)=>`<button class="${a.danger?'danger-btn':'secondary'} compact-btn" data-select-action="${i}" ${a.single?'data-single="1"':''}>${esc(a.label)}</button>`).join('')}<button class="subtle compact-btn" data-select-clear>Clear</button></div>`;
  host.prepend(bar);
  bar.querySelector('[data-select-clear]').onclick=e=>{e.preventDefault();selected[kind].clear();refresh(kind)};
  bar.querySelector('[data-select-visible]')?.addEventListener('click',e=>{e.preventDefault();const wrappers=[...document.querySelectorAll(`.record-select-row[data-select-kind="${kind}"]`)].filter(w=>!w.hidden&&getComputedStyle(w).display!=='none');const allSelected=wrappers.length&&wrappers.every(w=>selected[kind].has(w.dataset.selectId));for(const w of wrappers){allSelected?selected[kind].delete(w.dataset.selectId):selected[kind].add(w.dataset.selectId)}refresh(kind)});
  bar.querySelectorAll('[data-select-action]').forEach(b=>b.onclick=async e=>{e.preventDefault();const a=actions[Number(b.dataset.selectAction)],ids=[...selected[kind]];if(!a||!ids.length)return;if(a.single&&ids.length!==1)return;await a.run(ids)});
  return bar;
}
function updateBar(kind){const bar=document.querySelector(`[data-select-bar="${kind}"]`);if(!bar)return;const n=selected[kind].size;bar.hidden=!n;bar.querySelector('[data-select-count]').textContent=`${n} selected`;bar.querySelectorAll('[data-select-action][data-single="1"]').forEach(b=>b.disabled=n!==1)}
function decorateRows(kind,rows,idOf){for(const row of rows){if(row.closest('.record-select-row'))continue;const id=idOf(row);if(!id)continue;const wrap=document.createElement('div');wrap.className='record-select-row';wrap.dataset.selectKind=kind;wrap.dataset.selectId=id;const box=document.createElement('label');box.className='record-select-check';box.innerHTML=`<input type="checkbox" ${selected[kind].has(id)?'checked':''} aria-label="Select record">`;row.parentNode.insertBefore(wrap,row);wrap.append(box,row);const input=box.querySelector('input');box.onclick=e=>e.stopPropagation();input.onclick=e=>e.stopPropagation();input.onchange=e=>{e.stopPropagation();e.target.checked?selected[kind].add(id):selected[kind].delete(id);wrap.classList.toggle('selected',e.target.checked);updateBar(kind)};wrap.classList.toggle('selected',selected[kind].has(id))}}
function refresh(kind){document.querySelectorAll(`.record-select-row[data-select-kind="${kind}"]`).forEach(w=>{const on=selected[kind].has(w.dataset.selectId),x=w.querySelector('input[type="checkbox"]');if(x)x.checked=on;w.classList.toggle('selected',on)});updateBar(kind)}

async function enhanceCR(){if(window.__nodaraRoute!=='release')return;const view=document.getElementById('crv2-view'),grid=view?.querySelector('.smart-grid');if(!view||!grid)return;ensureBar('release',view,[
 {label:'Open',single:true,run:ids=>window.nodaraCROpen?.(ids[0])},
 {label:'Edit',single:true,run:async ids=>{await window.nodaraCROpen?.(ids[0]);const b=document.getElementById('crv2-edit');if(!b)return alert('Released cargo releases cannot be edited.');b.click()}},
 {label:'Delete',single:true,danger:true,run:async ids=>{await window.nodaraCROpen?.(ids[0]);const b=document.getElementById('crv2-delete');if(!b)return alert('Released cargo releases cannot be deleted.');b.click()}}
 ]);decorateRows('release',[...grid.querySelectorAll('.smart-grid-row.body')],r=>r.dataset.gridOpen);updateBar('release')}

async function removeRates(ids){
 if(!ids.length)return;
 if(!confirm(`Remove ${ids.length} selected rate${ids.length===1?'':'s'} from the active Rate Book? Used rates will be archived so historical transactions remain intact.`))return;
 let archived=0,deleted=0;
 for(const sid of ids){
  const [agr,tmp,chg]=await Promise.all([
   supabase.from('customer_rate_agreements').select('id',{count:'exact',head:true}).eq('service_id',sid),
   supabase.from('rate_template_lines').select('id',{count:'exact',head:true}).eq('service_id',sid),
   supabase.from('operational_charges').select('id',{count:'exact',head:true}).eq('service_id',sid)
  ]);
  for(const q of[agr,tmp,chg])if(q.error)return alert(q.error.message);
  const referenced=(agr.count||0)+(tmp.count||0)+(chg.count||0)>0;
  if(referenced){const a=await supabase.from('service_catalog').update({active:false,updated_at:new Date().toISOString()}).eq('id',sid);if(a.error)return alert(a.error.message);const b=await supabase.from('standard_rates').update({active:false,updated_at:new Date().toISOString()}).eq('service_id',sid);if(b.error)return alert(b.error.message);archived++}
  else{const a=await supabase.from('standard_rates').delete().eq('service_id',sid);if(a.error)return alert(a.error.message);const b=await supabase.from('service_catalog').delete().eq('id',sid);if(b.error)return alert(b.error.message);deleted++}
 }
 selected.rates.clear();alert(`${deleted} deleted · ${archived} archived`);window.nodaraRateBook?.open?.();
}
async function exportSelectedRates(ids){
 if(!ids.length)return;
 const [s,r]=await Promise.all([supabase.from('service_catalog').select('id,code,name,domain,default_unit,description').in('id',ids),supabase.from('standard_rates').select('service_id,sell_rate,minimum_charge,currency,unit,effective_from').in('service_id',ids).eq('active',true).order('effective_from',{ascending:false})]);if(s.error)return alert(s.error.message);if(r.error)return alert(r.error.message);
 const latest=new Map();for(const x of r.data||[])if(!latest.has(x.service_id))latest.set(x.service_id,x);const csv=v=>{const z=String(v??'');return /[",\n]/.test(z)?`"${z.replace(/"/g,'""')}"`:z};const heads=['Domain','Service','Code','Unit','Sell Rate','Minimum','Currency','Effective From'];const lines=[heads.join(','),...(s.data||[]).map(x=>{const z=latest.get(x.id)||{};return [x.domain,x.name,x.code,z.unit||x.default_unit,z.sell_rate??'',z.minimum_charge??'',z.currency||'USD',z.effective_from||''].map(csv).join(',')})];const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NODARA-Selected-Rates-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)
}
function enhanceRates(){if(window.__nodaraRoute!=='pricing_rates')return;const list=document.querySelector('.rate-book-section .rate-list');if(!list)return;const host=list.parentElement;ensureBar('rates',host,[{label:'Edit',single:true,run:ids=>document.querySelector(`[data-rate-service="${ids[0]}"]`)?.click()},{label:'Export Selected',run:exportSelectedRates},{label:'Delete / Archive',danger:true,run:removeRates}],{selectVisible:true});decorateRows('rates',[...list.querySelectorAll('.rate-row')],r=>r.dataset.rateService);refresh('rates')}

async function archiveLocations(ids){if(!confirm(`Archive ${ids.length} selected location${ids.length===1?'':'s'}? Historical warehouse transactions will keep their location references.`))return;const{error}=await supabase.from('warehouse_locations').update({active:false}).in('id',ids);if(error)return alert(error.message);selected.locations.clear();window.nodaraLocations?.()}
function enhanceLocations(){if(!['warehouse_locations','settings_locations'].includes(window.__nodaraRoute))return;const list=document.getElementById('loc-list'),table=list?.querySelector('.location-table');if(!list||!table)return;ensureBar('locations',list,[{label:'Edit',single:true,run:ids=>document.querySelector(`[data-loc-open="${ids[0]}"]`)?.click()},{label:'Archive',danger:true,run:archiveLocations}],{selectVisible:true});decorateRows('locations',[...table.querySelectorAll('[data-loc-open]')],r=>r.dataset.locOpen);updateBar('locations')}

function enhance(){enhanceCR();enhanceRates();enhanceLocations()}
const obs=new MutationObserver(()=>requestAnimationFrame(enhance));obs.observe(document.body,{childList:true,subtree:true});setTimeout(enhance,500);
