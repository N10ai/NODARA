import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
let activeCargoId=null;

if(!document.querySelector('link[data-wr23-css]')){
  const l=document.createElement('link');
  l.rel='stylesheet';
  l.href='./wr-canonical-v23.css?v=20260912-v23';
  l.dataset.wr23Css='1';
  document.head.appendChild(l);
}

function receiptNumber(){
  return main.querySelector('.wr22-num,.wr19-num')?.textContent?.trim()||null;
}

function ensureEvidenceContext(){
  const root=main.querySelector('.wr22');
  const n=receiptNumber();
  if(!root||!n)return;
  let bridge=root.querySelector('.txw-title.nodara-v23-context');
  if(!bridge){
    bridge=document.createElement('span');
    bridge.className='txw-title nodara-v23-context';
    bridge.style.cssText='position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;opacity:0!important;pointer-events:none!important';
    root.appendChild(bridge);
  }
  bridge.textContent=n;
  window.__nodaraActiveWRNumber=n;
}

async function resolveCargoId(){
  if(activeCargoId)return activeCargoId;
  const n=receiptNumber();
  if(!n)return null;
  const {data:wr}=await supabase.from('warehouse_receipts').select('job_id').eq('receipt_number',n).maybeSingle();
  if(!wr?.job_id)return null;
  const {data}=await supabase.from('cargo_units').select('id,metadata,created_at').eq('job_id',wr.job_id).order('created_at',{ascending:false}).limit(20);
  const draft=(data||[]).find(x=>x.metadata?.editor_draft);
  return draft?.id||data?.[0]?.id||null;
}

function numberValue(el){
  if(!el||el.value==='')return null;
  const n=Number(el.value);
  return Number.isFinite(n)?n:null;
}

async function savePhysicalFields(modal){
  const id=await resolveCargoId();
  if(!id)return;
  const w=numberValue(modal.querySelector('#c-weight'));
  const l=numberValue(modal.querySelector('#c-l'));
  const wi=numberValue(modal.querySelector('#c-w'));
  const h=numberValue(modal.querySelector('#c-h'));
  const weightUnit=modal.querySelector('#c-weight-unit')?.value||modal.querySelector('[data-weight-unit]')?.value||'KG';
  const dimUnit=modal.querySelector('#c-dim-unit')?.value||modal.querySelector('[data-dim-unit]')?.value||'IN';
  const each=modal.querySelector('#v23-weight-each')?.checked||false;
  const kg=w==null?null:(weightUnit==='LB'?w*0.45359237:w);
  const inch=v=>v==null?null:(dimUnit==='CM'?v/2.54:v);
  const {data:row}=await supabase.from('cargo_units').select('metadata').eq('id',id).maybeSingle();
  const metadata={...(row?.metadata||{}),weight_basis:each?'EACH':'TOTAL'};
  const {error}=await supabase.from('cargo_units').update({weight_kg:kg,weight_lb:kg==null?null:kg/0.45359237,length_in:inch(l),width_in:inch(wi),height_in:inch(h),metadata}).eq('id',id);
  if(error)throw error;
}

function enhanceCargoModal(){
  const modal=document.querySelector('.wr22-modal');
  if(!modal||modal.dataset.v23Cargo)return;
  if(!modal.querySelector('#c-weight')&&!modal.querySelector('#c-l'))return;
  modal.dataset.v23Cargo='1';

  const weight=modal.querySelector('#c-weight');
  const length=modal.querySelector('#c-l');
  const width=modal.querySelector('#c-w');
  const height=modal.querySelector('#c-h');

  if(weight){
    const holder=weight.closest('.wr22-pill')||weight.parentElement;
    holder?.classList.add('v23-weight-row');
    if(!modal.querySelector('#v23-weight-each')){
      const toggle=document.createElement('label');
      toggle.className='v23-weight-toggle';
      toggle.innerHTML='<input type="checkbox" id="v23-weight-each"><span></span><b>Total</b><em>Each</em>';
      holder?.insertAdjacentElement('afterend',toggle);
    }
  }

  if(length&&width&&height){
    const blocks=[length,width,height].map(x=>x.closest('.wr22-pill')||x.parentElement).filter(Boolean);
    const first=blocks[0];
    if(first&&!first.parentElement?.classList.contains('v23-dims-row')){
      const row=document.createElement('div');
      row.className='v23-dims-row';
      first.parentNode.insertBefore(row,first);
      blocks.forEach((b,i)=>{b.classList.add('v23-dim-box');b.dataset.label=['L','W','H'][i];row.appendChild(b)});
    }
  }

  const photo=modal.querySelector('[data-photo],#c-photo');
  if(photo){
    photo.onclick=async e=>{
      e.preventDefault();e.stopPropagation();
      ensureEvidenceContext();
      const id=await resolveCargoId();
      if(!id)return alert('Save the cargo draft first.');
      window.NodaraWRMedia?.openCargoCamera?.({cargoId:id});
    };
  }

  const done=[...modal.querySelectorAll('button')].find(b=>/^(Done|Add cargo|Save)$/i.test(b.textContent.trim()));
  if(done){
    done.addEventListener('click',async()=>{
      try{await savePhysicalFields(modal)}catch(err){console.error('v23 physical save',err);alert('Could not save weight/dimensions: '+err.message)}
    },true);
  }
}

function simplifyMobileCargo(){
  if(!matchMedia('(max-width:760px)').matches)return;
  main.querySelectorAll('.wr22-table tbody tr').forEach(row=>{
    if(row.dataset.v23Card)return;
    row.dataset.v23Card='1';
    const edit=row.querySelector('[data-edit-cargo]');
    if(!edit)return;
    row.dataset.openCargo=edit.dataset.editCargo;
    const actions=row.querySelector('.wr22-rowactions');
    if(actions)actions.style.display='none';
    row.addEventListener('click',e=>{
      if(e.target.closest('input,button,a'))return;
      activeCargoId=row.dataset.openCargo;
      edit.click();
    });
  });
}

function fixBackButton(){
  document.querySelectorAll('.wr22-back').forEach(b=>{
    if(b.dataset.v23Back)return;
    b.dataset.v23Back='1';
    b.onclick=e=>{
      e.preventDefault();e.stopPropagation();
      if(typeof window.nodaraWRList==='function')window.nodaraWRList();
      else if(typeof window.nodaraSetActive==='function')window.nodaraSetActive('wr');
    };
  });
}

function rememberCargoClick(e){
  const b=e.target.closest?.('[data-edit-cargo],[data-inside],[data-add-cargo]');
  if(!b)return;
  activeCargoId=b.dataset.editCargo||b.dataset.inside||null;
}

document.addEventListener('click',rememberCargoClick,true);

function run(){
  ensureEvidenceContext();
  simplifyMobileCargo();
  enhanceCargoModal();
  fixBackButton();
}
new MutationObserver(()=>requestAnimationFrame(run)).observe(document.body,{childList:true,subtree:true});
setInterval(run,1000);
run();
