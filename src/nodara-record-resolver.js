const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/**
 * Universal NODARA record-field contract.
 * Record-backed fields always allow:
 * 1) type/search existing records
 * 2) use typed text only on the current transaction
 * 3) create a reusable master record from the typed text
 *
 * IMPORTANT: the result DOM is created once. Keystrokes only update existing
 * nodes; we never replace the input or its parent while the user is typing.
 * This keeps iOS/Safari focus and keyboard ownership stable.
 */
export function mountRecordResolver(host,{label='Record',required=false,placeholder='Search, type, or create…',value='',status='',search,formatResult,onSelect,onUseTyped,onCreate,onClear,createLabel='Create new record',typedLabel='Use only on this transaction'}={}){
 if(!host)return null;
 host.innerHTML=`<div class="nr-resolver"><div class="nr-label"><b>${esc(label)}</b><span>${required?'Required':'Optional'}</span></div><div class="nr-inputrow"><span class="nr-search">⌕</span><input class="nr-input" autocomplete="off" autocapitalize="words" inputmode="text" value="${esc(value)}" placeholder="${esc(placeholder)}"><button type="button" class="nr-clear" aria-label="Clear">×</button></div><div class="nr-menu" hidden><div class="nr-results"></div><button type="button" class="nr-use" data-nr-use hidden><b></b><small>Keep this value only on the current transaction</small></button><button type="button" class="nr-create" data-nr-create hidden><b></b><small>Create a reusable master record and select it</small></button><div class="nr-empty" hidden>Type to search or create.</div></div><small class="nr-status">${esc(status||'')}</small></div>`;
 const root=host.firstElementChild,input=root.querySelector('.nr-input'),menu=root.querySelector('.nr-menu'),results=root.querySelector('.nr-results'),useBtn=root.querySelector('[data-nr-use]'),createBtn=root.querySelector('[data-nr-create]'),empty=root.querySelector('.nr-empty'),clear=root.querySelector('.nr-clear'),state=root.querySelector('.nr-status');
 let timer=0,seq=0,destroyed=false,currentRows=[];
 const close=()=>{menu.hidden=true};
 const setStatus=t=>{state.textContent=t||''};
 function ensureResultButtons(){
  if(results.children.length===8)return;
  results.replaceChildren();
  for(let i=0;i<8;i++){
   const b=document.createElement('button');b.type='button';b.hidden=true;b.dataset.nrPick=String(i);b.innerHTML='<b></b><small></small>';
   b.addEventListener('pointerdown',e=>e.preventDefault());
   b.addEventListener('click',async e=>{e.preventDefault();const r=currentRows[Number(b.dataset.nrPick)];if(!r)return;try{await onSelect?.(r);const f=formatResult?formatResult(r):{title:r.name||r.label||String(r)};input.value=f.title||'';setStatus('Saved record');close()}catch(err){setStatus(err?.message||'Could not select record')}finally{input.focus({preventScroll:true})}});
   results.appendChild(b);
  }
 }
 ensureResultButtons();
 async function paint(){
  const mine=++seq,q=input.value.trim();let rows=[];
  try{rows=await Promise.resolve(search?.(q)||[])}catch(e){if(!destroyed)setStatus(e.message||'Search failed');return}
  if(destroyed||mine!==seq)return;
  currentRows=(rows||[]).slice(0,8);
  [...results.children].forEach((b,i)=>{const r=currentRows[i];if(!r){b.hidden=true;return}const f=formatResult?formatResult(r):{title:r.name||r.label||String(r),subtitle:r.code||''};b.hidden=false;b.querySelector('b').textContent=f.title||'';b.querySelector('small').textContent=f.subtitle||'Saved record'});
  useBtn.hidden=!q;createBtn.hidden=!q;empty.hidden=!!q||currentRows.length>0;
  if(q){useBtn.querySelector('b').textContent=typedLabel.replace('{value}',q);createBtn.querySelector('b').textContent='＋ '+createLabel.replace('{value}',q)}
  menu.hidden=false;
 }
 useBtn.addEventListener('pointerdown',e=>e.preventDefault());
 createBtn.addEventListener('pointerdown',e=>e.preventDefault());
 useBtn.addEventListener('click',async e=>{e.preventDefault();const q=input.value.trim();if(!q)return;try{await onUseTyped?.(q);close();setStatus('Saved on this transaction only')}catch(err){setStatus(err?.message||'Could not save value')}finally{input.focus({preventScroll:true})}});
 createBtn.addEventListener('click',async e=>{e.preventDefault();const q=input.value.trim();if(!q)return;try{const created=await onCreate?.(q);if(created?.name||created?.label)input.value=created.name||created.label;close();setStatus('Reusable record created')}catch(err){setStatus(err?.message||'Could not create record')}finally{input.focus({preventScroll:true})}});
 input.addEventListener('focus',paint);
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(paint,70)});
 input.addEventListener('keydown',e=>{if(e.key==='Escape'){close();return}if(e.key==='Enter'){e.preventDefault();const first=[...results.children].find(b=>!b.hidden);if(first)first.click();else if(input.value.trim())useBtn.click()}});
 clear.addEventListener('pointerdown',e=>e.preventDefault());
 clear.addEventListener('click',async()=>{try{await onClear?.();input.value='';setStatus('');close()}catch(err){setStatus(err?.message||'Could not clear value')}finally{input.focus({preventScroll:true})}});
 const outside=e=>{if(!root.contains(e.target))close()};document.addEventListener('pointerdown',outside,true);
 return{input,close,setValue(v,s=''){input.value=v||'';setStatus(s)},destroy(){destroyed=true;clearTimeout(timer);document.removeEventListener('pointerdown',outside,true)}};
}

if(!document.querySelector('style[data-nodara-record-resolver]')){const s=document.createElement('style');s.dataset.nodaraRecordResolver='';s.textContent=`
.nr-resolver{position:relative;display:grid;gap:7px;min-width:0}.nr-label{display:flex;align-items:center;justify-content:space-between;gap:8px}.nr-label b{font-size:11px}.nr-label span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#8c95a7)}.nr-inputrow{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;border:1px solid var(--border,rgba(255,255,255,.11));border-radius:12px;padding:0 10px;background:var(--panel,#0d1118)}.nr-input{width:100%;min-width:0;border:0!important;outline:0!important;background:transparent!important;padding:12px 0!important;color:inherit;font:inherit}.nr-search{color:var(--muted,#8c95a7)}.nr-clear{border:0;background:transparent;color:var(--muted,#8c95a7);font-size:18px}.nr-menu{position:absolute;z-index:120;left:0;right:0;top:64px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:13px;background:#0c1118;box-shadow:0 18px 40px rgba(0,0,0,.35);padding:6px;max-height:300px;overflow:auto}.nr-menu button{display:grid;width:100%;text-align:left;gap:2px;padding:10px;border:0;border-radius:9px;background:transparent;color:inherit}.nr-menu button:hover,.nr-menu button:focus{background:rgba(255,255,255,.06)}.nr-menu button small,.nr-status{color:var(--muted,#8c95a7);font-size:10px}.nr-use{border-top:1px solid rgba(255,255,255,.07)!important;margin-top:4px}.nr-create b{color:#7eb4ff}.nr-empty{padding:10px;color:var(--muted,#8c95a7);font-size:11px}@media(max-width:760px){.nr-menu{position:absolute;left:0;right:0;top:64px;bottom:auto;max-height:min(260px,36vh);overscroll-behavior:contain}}
`;document.head.appendChild(s)}
