const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Shared NODARA smart record field.
 * Mirrors the proven WR smart-field interaction:
 * type/search -> select saved record -> use typed value once -> create master record.
 */
export function mountRecordResolver(host,{label='Record',required=false,placeholder='Search, type once, or create new',value='',status='',search,formatResult,onSelect,onUseTyped,onCreate,onClear,createLabel='Create new master record',typedLabel='Use typed value for this transaction only'}={}){
 if(!host)return null;
 host.innerHTML=`<label class="nr-resolver wr-smart-field"><span class="nr-label">${esc(label)}${required?' <em>Required</em>':''}</span><div class="nr-inputwrap"><input class="nr-input" autocomplete="off" autocapitalize="words" spellcheck="false" inputmode="text" value="${esc(value)}" placeholder="${esc(placeholder)}"><button type="button" class="nr-clear" aria-label="Clear">×</button></div><div class="nr-menu" hidden><div class="nr-results"></div><button type="button" class="nr-use" data-nr-use hidden>Use typed value for this transaction only</button><button type="button" class="nr-create" data-nr-create hidden>＋ Create new master record</button><div class="nr-empty" hidden>No saved matches.</div></div><div class="nr-preview" ${status?'':'hidden'}>${esc(status||'')}</div></label>`;
 const root=host.firstElementChild,input=root.querySelector('.nr-input'),clear=root.querySelector('.nr-clear'),menu=root.querySelector('.nr-menu'),preview=root.querySelector('.nr-preview');
 const results=menu.querySelector('.nr-results'),useBtn=menu.querySelector('[data-nr-use]'),createBtn=menu.querySelector('[data-nr-create]'),empty=menu.querySelector('.nr-empty');
 let timer=0,seq=0,destroyed=false,currentRows=[],api=null;
 const setStatus=t=>{if(destroyed)return;preview.textContent=t||'';preview.hidden=!t};
 const close=()=>{if(destroyed)return;menu.hidden=true;if(window.__nodaraOpenResolver===api)window.__nodaraOpenResolver=null};
 const claim=()=>{const other=window.__nodaraOpenResolver;if(other&&other!==api)other.close?.();window.__nodaraOpenResolver=api};
 for(let i=0;i<7;i++){
  const b=document.createElement('button');b.type='button';b.hidden=true;b.dataset.nrPick=String(i);b.innerHTML='<b></b><small></small>';
  b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()});
  b.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const r=currentRows[i];if(!r)return;try{await onSelect?.(r);const f=formatResult?formatResult(r):{title:r.name||r.label||String(r)};input.value=f.title||'';setStatus(f.subtitle||'Saved record');close()}catch(err){setStatus(err?.message||'Could not select record')}});
  results.appendChild(b);
 }
 async function paint(){
  const mine=++seq,q=input.value.trim();let rows=[];
  try{rows=await Promise.resolve(search?.(q)||[])}catch(e){if(!destroyed)setStatus(e?.message||'Search failed');return}
  if(destroyed||mine!==seq)return;
  currentRows=(rows||[]).slice(0,7);
  [...results.children].forEach((b,i)=>{const r=currentRows[i];if(!r){b.hidden=true;return}const f=formatResult?formatResult(r):{title:r.name||r.label||String(r),subtitle:r.code||''};b.hidden=false;b.querySelector('b').textContent=f.title||'';b.querySelector('small').textContent=f.subtitle||'Saved record'});
  useBtn.hidden=!q;createBtn.hidden=!q;empty.hidden=currentRows.length>0||!q;
  if(q){useBtn.textContent=typedLabel.includes('{value}')?typedLabel.replace('{value}',q):typedLabel;createBtn.textContent='＋ '+(createLabel.includes('{value}')?createLabel.replace('{value}',q):createLabel)}
  claim();menu.hidden=false;
 }
 [useBtn,createBtn].forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()}));
 useBtn.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const q=input.value.trim();if(!q)return;try{await onUseTyped?.(q);setStatus('Typed for this transaction only');close()}catch(err){setStatus(err?.message||'Could not save value')}});
 createBtn.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const q=input.value.trim();if(!q)return;try{const created=await onCreate?.(q);if(created?.name||created?.label)input.value=created.name||created.label;setStatus('Saved record');close()}catch(err){setStatus(err?.message||'Could not create record')}});
 input.addEventListener('focus',e=>{e.stopPropagation();paint()});
 input.addEventListener('pointerdown',e=>e.stopPropagation());input.addEventListener('click',e=>e.stopPropagation());
 input.addEventListener('input',e=>{e.stopPropagation();setStatus('');clearTimeout(timer);timer=setTimeout(paint,60)});
 input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){close();return}if(e.key==='Enter'){e.preventDefault();const q=input.value.trim().toLowerCase(),idx=currentRows.findIndex(x=>{const f=formatResult?formatResult(x):{title:x.name||x.label||String(x)};return String(f.title||'').toLowerCase()===q});if(idx>=0)results.children[idx]?.click();else if(input.value.trim())useBtn.click()}});
 clear.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()});
 clear.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();try{await onClear?.();input.value='';setStatus('');close()}catch(err){setStatus(err?.message||'Could not clear value')}});
 input.addEventListener('blur',()=>setTimeout(()=>{if(!menu.matches(':hover'))close()},180));
 const outside=e=>{if(!root.contains(e.target))close()};document.addEventListener('pointerdown',outside,true);
 api={input,close,setValue(v,s=''){input.value=v||'';setStatus(s)},destroy(){destroyed=true;clearTimeout(timer);if(window.__nodaraOpenResolver===api)window.__nodaraOpenResolver=null;document.removeEventListener('pointerdown',outside,true)}};
 return api;
}

if(!document.querySelector('style[data-nodara-record-resolver]')){const s=document.createElement('style');s.dataset.nodaraRecordResolver='';s.textContent=`
.nr-resolver{position:relative;display:block;min-width:0}.nr-label{display:block;font-size:8px;letter-spacing:.09em;text-transform:uppercase;color:#8197ad;margin:0 0 6px 2px;font-style:normal}.nr-label em{float:right;font-size:8px;color:#8197ad;font-style:normal;font-weight:500}.nr-inputwrap{position:relative}.nr-input{width:100%;min-height:48px;border:1px solid #29445f;background:#050c13;color:#fff;border-radius:14px;padding:0 42px 0 13px;font-size:16px!important;box-sizing:border-box;-webkit-text-size-adjust:100%}.nr-input:focus{outline:none;border-color:#4c91e4;box-shadow:0 0 0 4px #438cff16}.nr-clear{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:36px;height:36px;border:0;background:transparent;color:#8197ad;font-size:22px}.nr-menu{position:absolute;left:0;right:0;top:calc(100% - 1px);z-index:80000;border:1px solid #2a455f;background:#07121c;border-radius:14px;box-shadow:0 18px 50px #000c;overflow:hidden;max-height:min(330px,45vh);overflow-y:auto}.nr-menu[hidden]{display:none!important}.nr-menu button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #172b3d;background:transparent;color:#dbe6f0;padding:10px 12px}.nr-menu button b{display:block;font-size:13px}.nr-menu button small{display:block;color:#71869c;margin-top:2px;font-size:10px}.nr-use,.nr-create{font-size:12px}.nr-create{color:#8ebcff!important}.nr-preview{margin-top:7px;padding:9px 11px;border-radius:11px;background:#071521;border:1px solid #1d3850;color:#9eb1c3;font-size:10px;line-height:1.45}.nr-preview[hidden]{display:none!important}@media(max-width:760px){.nr-menu{max-height:260px}.nr-input{font-size:16px!important}}
`;document.head.appendChild(s)}