const main=document.getElementById('main');
const crSelected=new Set();
const entitySelected=new Set();

function syncSmart(host,set){
 const rows=[...host.querySelectorAll('.smart-grid-select-row:not(.head-wrap)')];
 for(const w of rows){const id=w.dataset.selectId,x=w.querySelector('input[data-native-row]'),on=set.has(id);if(x)x.checked=on;w.classList.toggle('selected',on)}
 const head=host.querySelector('[data-native-all]');if(head){const n=rows.filter(w=>set.has(w.dataset.selectId)).length;head.checked=rows.length>0&&n===rows.length;head.indeterminate=n>0&&n<rows.length}
}
function enhanceCR(){
 if(window.__nodaraRoute!=='release')return;
 const host=document.getElementById('crv2-view'),grid=host?.querySelector('.smart-grid');
 if(!host||!grid)return;
 grid.classList.add('selectable');

 // data-view always renders the column header inside a wrapper div. Reuse that
 // wrapper for the selector column instead of looking only for a direct child.
 let headWrap=grid.querySelector(':scope > .head-wrap');
 const head=grid.querySelector(':scope > div > .smart-grid-row.head, :scope > .smart-grid-row.head');
 if(!headWrap&&head){
   const existingParent=head.parentElement;
   if(existingParent&&existingParent.parentElement===grid&&existingParent.children.length===1){
     headWrap=existingParent;
     headWrap.className='smart-grid-select-row head-wrap';
     const lab=document.createElement('label');lab.className='grid-select-box';lab.innerHTML='<input type="checkbox" data-native-all aria-label="Select visible records">';
     headWrap.prepend(lab);
   }else{
     headWrap=document.createElement('div');headWrap.className='smart-grid-select-row head-wrap';head.parentNode.insertBefore(headWrap,head);headWrap.innerHTML='<label class="grid-select-box"><input type="checkbox" data-native-all aria-label="Select visible records"></label>';headWrap.appendChild(head)
   }
 }else if(headWrap&&!headWrap.querySelector('[data-native-all]')){
   const lab=document.createElement('label');lab.className='grid-select-box';lab.innerHTML='<input type="checkbox" data-native-all aria-label="Select visible records">';headWrap.prepend(lab)
 }

 for(const row of [...grid.querySelectorAll(':scope > .smart-grid-row.body, :scope > div:not(.smart-grid-select-row) > .smart-grid-row.body')]){const id=row.dataset.gridOpen;if(!id||row.closest('.smart-grid-select-row'))continue;const wrap=document.createElement('div');wrap.className='smart-grid-select-row';wrap.dataset.selectId=id;const lab=document.createElement('label');lab.className='grid-select-box';lab.innerHTML='<input type="checkbox" data-native-row aria-label="Select record">';row.parentNode.insertBefore(wrap,row);wrap.append(lab,row)}

 if(!host.dataset.nativeSelectBound){
   host.dataset.nativeSelectBound='1';
   host.addEventListener('click',e=>{if(e.target.closest('.grid-select-box'))e.stopPropagation()});
   host.addEventListener('change',e=>{const all=e.target.closest?.('[data-native-all]');if(all){for(const w of host.querySelectorAll('.smart-grid-select-row:not(.head-wrap)'))all.checked?crSelected.add(w.dataset.selectId):crSelected.delete(w.dataset.selectId);syncSmart(host,crSelected);return}const x=e.target.closest?.('[data-native-row]');if(!x)return;const id=x.closest('.smart-grid-select-row')?.dataset.selectId;if(!id)return;x.checked?crSelected.add(id):crSelected.delete(id);syncSmart(host,crSelected)})
 }
 syncSmart(host,crSelected)
}
function syncEntities(host){const wraps=[...host.querySelectorAll('.entity-select-row')];for(const w of wraps){const on=entitySelected.has(w.dataset.id),x=w.querySelector('[data-entity-native-row]');if(x)x.checked=on;w.classList.toggle('selected',on)}const h=host.querySelector('[data-entity-native-all]');if(h){const n=wraps.filter(w=>entitySelected.has(w.dataset.id)).length;h.checked=wraps.length>0&&n===wraps.length;h.indeterminate=n>0&&n<wraps.length}}
function enhanceEntities(){
 if(window.__nodaraRoute!=='entities')return;const table=document.querySelector('#entity-list .entity-table');if(!table||table.dataset.nativeSelect)return;table.dataset.nativeSelect='1';
 const head=document.createElement('div');head.className='entity-select-head';head.innerHTML='<label class="grid-select-box"><input type="checkbox" data-entity-native-all aria-label="Select visible entities"></label><span>Entity</span><span>Roles</span><span>Contact</span>';table.prepend(head);
 for(const row of [...table.querySelectorAll(':scope > [data-entity]')]){const w=document.createElement('div');w.className='entity-select-row';w.dataset.id=row.dataset.entity;const lab=document.createElement('label');lab.className='grid-select-box';lab.innerHTML='<input type="checkbox" data-entity-native-row aria-label="Select entity">';row.parentNode.insertBefore(w,row);w.append(lab,row)}
 table.addEventListener('click',e=>{if(e.target.closest('.grid-select-box'))e.stopPropagation()});table.addEventListener('change',e=>{if(e.target.matches('[data-entity-native-all]')){for(const w of table.querySelectorAll('.entity-select-row'))e.target.checked?entitySelected.add(w.dataset.id):entitySelected.delete(w.dataset.id);syncEntities(table);return}const x=e.target.closest('[data-entity-native-row]');if(!x)return;const id=x.closest('.entity-select-row')?.dataset.id;if(!id)return;x.checked?entitySelected.add(id):entitySelected.delete(id);syncEntities(table)});syncEntities(table)
}
function alignRateHeader(){if(window.__nodaraRoute!=='pricing_rates')return;const list=document.querySelector('.rate-book-section .rate-list');if(!list)return;const old=list.querySelector(':scope > [data-inline-select-head="rates"]');if(!old||old.classList.contains('rate-native-head'))return;old.classList.add('rate-native-head');const span=document.createElement('div');span.className='rate-native-head-fill';old.appendChild(span)}
function isolateOnboarding(){
 if(window.__nodaraRoute!=='entities')return;const sec=document.getElementById('onboarding'),tabs=document.querySelector('.entity-tabs');if(!sec||!tabs||tabs.dataset.onboardingIsolated)return;tabs.dataset.onboardingIsolated='1';sec.hidden=true;
 tabs.addEventListener('click',e=>{const b=e.target.closest('[data-jump]');if(!b)return;const isOn=b.dataset.jump==='onboarding';sec.hidden=!isOn;if(isOn){for(const s of main.querySelectorAll('.record-section:not(#onboarding)'))s.dataset.preOnboardDisplay=s.style.display,s.style.display='none'}else{for(const s of main.querySelectorAll('.record-section:not(#onboarding)')){if('preOnboardDisplay'in s.dataset){s.style.display=s.dataset.preOnboardDisplay||'';delete s.dataset.preOnboardDisplay}}}})
}
function enhance(){enhanceCR();enhanceEntities();alignRateHeader();isolateOnboarding()}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance()})}).observe(main,{childList:true,subtree:true});setTimeout(enhance,250);
