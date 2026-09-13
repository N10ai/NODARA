const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/**
 * Universal NODARA record-field contract.
 * A record-backed field always allows:
 * 1) type/search existing records
 * 2) use typed text only on the current transaction
 * 3) create a reusable master record from the typed text
 *
 * This component owns its DOM and never rerenders its parent while the user types.
 */
export function mountRecordResolver(host,{label='Record',required=false,placeholder='Search, type, or create…',value='',status='',search,formatResult,onSelect,onUseTyped,onCreate,onClear,createLabel='Create new record',typedLabel='Use only on this transaction'}={}){
 if(!host)return null;
 host.innerHTML=`<div class="nr-resolver"><div class="nr-label"><b>${esc(label)}</b><span>${required?'Required':'Optional'}</span></div><div class="nr-inputrow"><span class="nr-search">⌕</span><input class="nr-input" autocomplete="off" inputmode="text" value="${esc(value)}" placeholder="${esc(placeholder)}"><button type="button" class="nr-clear" aria-label="Clear">×</button></div><div class="nr-menu" hidden></div><small class="nr-status">${esc(status||'')}</small></div>`;
 const root=host.firstElementChild,input=root.querySelector('.nr-input'),menu=root.querySelector('.nr-menu'),clear=root.querySelector('.nr-clear'),state=root.querySelector('.nr-status');
 let timer=0,seq=0,destroyed=false;
 const close=()=>{menu.hidden=true;menu.innerHTML=''};
 const setStatus=t=>{state.textContent=t||''};
 async function paint(){
  const mine=++seq,q=input.value.trim();
  let rows=[];
  try{rows=await Promise.resolve(search?.(q)||[])}catch(e){if(!destroyed)setStatus(e.message||'Search failed');return}
  if(destroyed||mine!==seq)return;
  const html=(rows||[]).slice(0,8).map((r,i)=>{const f=formatResult?formatResult(r):{title:r.name||r.label||String(r),subtitle:r.code||''};return `<button type="button" data-nr-pick="${i}"><b>${esc(f.title||'')}</b><small>${esc(f.subtitle||'Saved record')}</small></button>`});
  if(q){html.push(`<button type="button" class="nr-use" data-nr-use><b>${esc(typedLabel.replace('{value}',q))}</b><small>Keep this value only on the current transaction</small></button>`);html.push(`<button type="button" class="nr-create" data-nr-create><b>＋ ${esc(createLabel.replace('{value}',q))}</b><small>Create a reusable master record and select it</small></button>`)}
  menu.innerHTML=html.join('')||'<div class="nr-empty">Type to search or create.</div>';menu.hidden=false;
  menu.querySelectorAll('[data-nr-pick]').forEach(b=>b.onclick=async e=>{e.preventDefault();const r=rows[Number(b.dataset.nrPick)];input.disabled=true;try{await onSelect?.(r);close()}finally{input.disabled=false;input.focus()}});
  menu.querySelector('[data-nr-use]')?.addEventListener('click',async e=>{e.preventDefault();input.disabled=true;try{await onUseTyped?.(q);close();setStatus('Saved on this transaction only')}finally{input.disabled=false;input.focus()}});
  menu.querySelector('[data-nr-create]')?.addEventListener('click',async e=>{e.preventDefault();input.disabled=true;try{const created=await onCreate?.(q);if(created?.name||created?.label)input.value=created.name||created.label;close();setStatus('Reusable record created')}finally{input.disabled=false;input.focus()}})
 }
 input.addEventListener('focus',paint);
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(paint,90)});
 input.addEventListener('keydown',e=>{if(e.key==='Escape'){close();return}if(e.key==='Enter'){e.preventDefault();const first=menu.querySelector('[data-nr-pick]');if(first)first.click();else menu.querySelector('[data-nr-use]')?.click()}});
 clear.addEventListener('click',async()=>{input.disabled=true;try{await onClear?.();input.value='';setStatus('');close()}finally{input.disabled=false;input.focus()}});
 // Close without stealing focus. Capture pointer events only outside this resolver.
 const outside=e=>{if(!root.contains(e.target))close()};document.addEventListener('pointerdown',outside,true);
 return{input,close,setValue(v,s=''){input.value=v||'';setStatus(s)},destroy(){destroyed=true;clearTimeout(timer);document.removeEventListener('pointerdown',outside,true)}};
}

if(!document.querySelector('style[data-nodara-record-resolver]')){const s=document.createElement('style');s.dataset.nodaraRecordResolver='';s.textContent=`
.nr-resolver{position:relative;display:grid;gap:7px;min-width:0}.nr-label{display:flex;align-items:center;justify-content:space-between;gap:8px}.nr-label b{font-size:11px}.nr-label span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#8c95a7)}.nr-inputrow{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;border:1px solid var(--border,rgba(255,255,255,.11));border-radius:12px;padding:0 10px;background:var(--panel,#0d1118)}.nr-input{width:100%;min-width:0;border:0!important;outline:0!important;background:transparent!important;padding:12px 0!important;color:inherit;font:inherit}.nr-search{color:var(--muted,#8c95a7)}.nr-clear{border:0;background:transparent;color:var(--muted,#8c95a7);font-size:18px}.nr-menu{position:absolute;z-index:120;left:0;right:0;top:64px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:13px;background:#0c1118;box-shadow:0 18px 40px rgba(0,0,0,.35);padding:6px;max-height:300px;overflow:auto}.nr-menu button{display:grid;width:100%;text-align:left;gap:2px;padding:10px;border:0;border-radius:9px;background:transparent;color:inherit}.nr-menu button:hover,.nr-menu button:focus{background:rgba(255,255,255,.06)}.nr-menu button small,.nr-status{color:var(--muted,#8c95a7);font-size:10px}.nr-use{border-top:1px solid rgba(255,255,255,.07)!important;margin-top:4px}.nr-create b{color:#7eb4ff}.nr-empty{padding:10px;color:var(--muted,#8c95a7);font-size:11px}@media(max-width:760px){.nr-menu{position:fixed;left:18px;right:18px;top:auto;bottom:calc(88px + env(safe-area-inset-bottom));max-height:45vh}}
`;document.head.appendChild(s)}
