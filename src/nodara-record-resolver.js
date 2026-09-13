const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Canonical NODARA record field.
 * Contract: type/search existing -> use typed value on transaction -> create reusable record.
 * Results stay in normal document flow under the active field so mobile keyboards cannot
 * make the picker cover the input. Only one resolver can be open at a time.
 */
export function mountRecordResolver(host,{label='Record',required=false,placeholder='Search, type, or create…',value='',status='',search,formatResult,onSelect,onUseTyped,onCreate,onClear,createLabel='Create new record',typedLabel='Use only on this transaction'}={}){
 if(!host)return null;
 host.innerHTML=`<div class="nr-resolver"><div class="nr-label"><b>${esc(label)}</b><span>${required?'Required':'Optional'}</span></div><div class="nr-inputrow"><span class="nr-search">⌕</span><input class="nr-input" autocomplete="off" autocapitalize="words" spellcheck="false" inputmode="text" value="${esc(value)}" placeholder="${esc(placeholder)}"><button type="button" class="nr-clear" aria-label="Clear">×</button></div><small class="nr-status">${esc(status||'')}</small><div class="nr-menu" hidden><div class="nr-results"></div><button type="button" class="nr-use" data-nr-use hidden><b></b><small>Keep this value only on the current transaction</small></button><button type="button" class="nr-create" data-nr-create hidden><b></b><small>Create a reusable master record and select it</small></button><div class="nr-empty" hidden>Type to search or create.</div></div></div>`;
 const root=host.firstElementChild,input=root.querySelector('.nr-input'),clear=root.querySelector('.nr-clear'),state=root.querySelector('.nr-status'),menu=root.querySelector('.nr-menu');
 const results=menu.querySelector('.nr-results'),useBtn=menu.querySelector('[data-nr-use]'),createBtn=menu.querySelector('[data-nr-create]'),empty=menu.querySelector('.nr-empty');
 let timer=0,seq=0,destroyed=false,currentRows=[],api=null;
 const setStatus=t=>{if(!destroyed)state.textContent=t||''};
 const close=()=>{if(destroyed)return;menu.hidden=true;if(window.__nodaraOpenResolver===api)window.__nodaraOpenResolver=null};
 const claim=()=>{const other=window.__nodaraOpenResolver;if(other&&other!==api)other.close?.();window.__nodaraOpenResolver=api};
 for(let i=0;i<8;i++){
  const b=document.createElement('button');b.type='button';b.hidden=true;b.dataset.nrPick=String(i);b.innerHTML='<b></b><small></small>';
  b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()});
  b.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const r=currentRows[i];if(!r)return;try{await onSelect?.(r);const f=formatResult?formatResult(r):{title:r.name||r.label||String(r)};input.value=f.title||'';setStatus('Saved record');close()}catch(err){setStatus(err?.message||'Could not select record')}});
  results.appendChild(b);
 }
 async function paint(){
  const mine=++seq,q=input.value.trim();let rows=[];
  try{rows=await Promise.resolve(search?.(q)||[])}catch(e){if(!destroyed)setStatus(e?.message||'Search failed');return}
  if(destroyed||mine!==seq)return;
  currentRows=(rows||[]).slice(0,8);
  [...results.children].forEach((b,i)=>{const r=currentRows[i];if(!r){b.hidden=true;return}const f=formatResult?formatResult(r):{title:r.name||r.label||String(r),subtitle:r.code||''};b.hidden=false;b.querySelector('b').textContent=f.title||'';b.querySelector('small').textContent=f.subtitle||'Saved record'});
  useBtn.hidden=!q;createBtn.hidden=!q;empty.hidden=!!q||currentRows.length>0;
  if(q){useBtn.querySelector('b').textContent=typedLabel.replace('{value}',q);createBtn.querySelector('b').textContent='＋ '+createLabel.replace('{value}',q)}
  claim();menu.hidden=false;
 }
 [useBtn,createBtn].forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()}));
 useBtn.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const q=input.value.trim();if(!q)return;try{await onUseTyped?.(q);close();setStatus('Transaction only')}catch(err){setStatus(err?.message||'Could not save value')}});
 createBtn.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const q=input.value.trim();if(!q)return;try{const created=await onCreate?.(q);if(created?.name||created?.label)input.value=created.name||created.label;close();setStatus('Saved record')}catch(err){setStatus(err?.message||'Could not create record')}});
 input.addEventListener('focus',e=>{e.stopPropagation();paint()});
 input.addEventListener('pointerdown',e=>e.stopPropagation());
 input.addEventListener('click',e=>e.stopPropagation());
 input.addEventListener('input',e=>{e.stopPropagation();clearTimeout(timer);timer=setTimeout(paint,60)});
 input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){close();return}if(e.key==='Enter'){e.preventDefault();const q=input.value.trim().toLowerCase(),idx=currentRows.findIndex(x=>{const f=formatResult?formatResult(x):{title:x.name||x.label||String(x)};return String(f.title||'').toLowerCase()===q});if(idx>=0)results.children[idx]?.click();else if(input.value.trim())useBtn.click()}});
 clear.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()});
 clear.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();try{await onClear?.();input.value='';setStatus('');close()}catch(err){setStatus(err?.message||'Could not clear value')}});
 const outside=e=>{if(!root.contains(e.target))close()};document.addEventListener('pointerdown',outside,true);
 api={input,close,setValue(v,s=''){input.value=v||'';setStatus(s)},destroy(){destroyed=true;clearTimeout(timer);if(window.__nodaraOpenResolver===api)window.__nodaraOpenResolver=null;document.removeEventListener('pointerdown',outside,true)}};
 return api;
}

if(!document.querySelector('style[data-nodara-record-resolver]')){const s=document.createElement('style');s.dataset.nodaraRecordResolver='';s.textContent=`
.nr-resolver{position:relative;display:grid;gap:7px;min-width:0;overflow:visible}.nr-label{display:flex;align-items:center;justify-content:space-between;gap:8px}.nr-label b{font-size:11px}.nr-label span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#8c95a7)}.nr-inputrow{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;border:1px solid var(--border,rgba(255,255,255,.11));border-radius:12px;padding:0 10px;background:var(--panel,#0d1118)}.nr-input{width:100%;min-width:0;border:0!important;outline:0!important;background:transparent!important;padding:12px 0!important;color:inherit;font-size:16px!important;line-height:1.2!important;-webkit-text-size-adjust:100%}.nr-search{color:var(--muted,#8c95a7)}.nr-clear{border:0;background:transparent;color:var(--muted,#8c95a7);font-size:18px}.nr-status{min-height:13px}.nr-menu{position:static!important;inset:auto!important;width:100%!important;max-width:100%!important;box-sizing:border-box;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:13px;background:#0c1118;box-shadow:none;padding:6px;max-height:230px;overflow:auto;overscroll-behavior:contain}.nr-menu[hidden]{display:none!important}.nr-menu button{display:grid;width:100%;text-align:left;gap:2px;padding:10px;border:0;border-radius:9px;background:transparent;color:inherit}.nr-menu button:hover,.nr-menu button:focus{background:rgba(255,255,255,.06)}.nr-menu button small,.nr-status{color:var(--muted,#8c95a7);font-size:10px}.nr-use{border-top:1px solid rgba(255,255,255,.07)!important;margin-top:4px}.nr-create b{color:#7eb4ff}.nr-empty{padding:10px;color:var(--muted,#8c95a7);font-size:11px}@media(max-width:760px){.nr-menu{max-height:205px;border-radius:12px}.nr-menu button{padding:9px 10px}}
`;document.head.appendChild(s)}
