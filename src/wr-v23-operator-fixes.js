import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
let activeCargoId=null;
let childNavBusy=false;

if(!document.querySelector('link[data-wr23-css]')){
  const l=document.createElement('link');
  l.rel='stylesheet';
  l.href='./wr-canonical-v23.css?v=20260912-v26';
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
  if(!window.NodaraWRMedia&&window.NodaraWRCamera)window.NodaraWRMedia=window.NodaraWRCamera;
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
  const weight=numberValue(modal.querySelector('#c-weight'));
  const length=numberValue(modal.querySelector('#c-l'));
  const width=numberValue(modal.querySelector('#c-w'));
  const height=numberValue(modal.querySelector('#c-h'));
  const weightUnit=modal.querySelector('#c-wu')?.value||'LB';
  const dimUnit=modal.querySelector('#c-du')?.value||'IN';
  const each=modal.querySelector('#v23-weight-each')?.checked!==false;
  const lb=weight==null?null:(weightUnit==='KG'?weight*2.2046226218:weight);
  const inch=v=>v==null?null:(dimUnit==='CM'?v/2.54:v);
  const {data:row}=await supabase.from('cargo_units').select('metadata').eq('id',id).maybeSingle();
  const metadata={...(row?.metadata||{}),weight_basis:each?'EACH':'TOTAL',input_weight_unit:weightUnit,input_dimension_unit:dimUnit};
  const {error}=await supabase.from('cargo_units').update({weight_lb:lb,weight_kg:lb==null?null:lb*0.45359237,length_in:inch(length),width_in:inch(width),height_in:inch(height),metadata}).eq('id',id);
  if(error)throw error;
}

async function syncWeightBasis(modal){
  const id=await resolveCargoId();
  if(!id)return;
  const {data}=await supabase.from('cargo_units').select('metadata').eq('id',id).maybeSingle();
  const toggle=modal.querySelector('#v23-weight-each');
  if(toggle)toggle.checked=String(data?.metadata?.weight_basis||'EACH').toUpperCase()!=='TOTAL';
}

function normalizeCargoInputs(modal){
  const weight=modal.querySelector('#c-weight');
  const wu=modal.querySelector('#c-wu');
  const l=modal.querySelector('#c-l');
  const w=modal.querySelector('#c-w');
  const h=modal.querySelector('#c-h');
  const du=modal.querySelector('#c-du');

  const weightHolder=weight?.closest('.wr22-pill');
  if(weightHolder){
    weightHolder.classList.add('v24-weight-pill');
    weight?.setAttribute('inputmode','decimal');
    weight?.setAttribute('placeholder','0');
    wu?.setAttribute('aria-label','Weight unit');
    if(!modal.querySelector('#v23-weight-each')){
      const toggle=document.createElement('label');
      toggle.className='v23-weight-toggle';
      toggle.innerHTML='<input type="checkbox" id="v23-weight-each" checked><span></span><b>Total</b><em>Each</em>';
      weightHolder.insertAdjacentElement('afterend',toggle);
    }
  }

  const dimHolder=l?.closest('.wr22-pill');
  if(dimHolder&&w&&h&&du){
    dimHolder.classList.add('v24-dims-pill');
    [[l,'L'],[w,'W'],[h,'H']].forEach(([el,label])=>{
      el.setAttribute('placeholder',label);
      el.setAttribute('inputmode','decimal');
      el.dataset.dimLabel=label;
    });
    du.setAttribute('aria-label','Dimension unit');
  }
}

async function injectChildNavigation(modal){
  if(childNavBusy||!activeCargoId||!modal?.isConnected)return;
  const nav=modal.querySelector('.wr22-cargonav');
  if(!nav)return;
  childNavBusy=true;
  try{
    const {data:current}=await supabase.from('cargo_units').select('id,parent_id').eq('id',activeCargoId).maybeSingle();
    const parentId=current?.parent_id||null;
    const scopeId=parentId||activeCargoId;
    let rows=[];
    if(parentId){
      const {data}=await supabase.from('cargo_units').select('id,package_type,handling_unit_code,parent_id').or(`id.eq.${parentId},parent_id.eq.${parentId}`).order('created_at');
      rows=data||[];
    }else{
      const {data}=await supabase.from('cargo_units').select('id,package_type,handling_unit_code,parent_id').or(`id.eq.${activeCargoId},parent_id.eq.${activeCargoId}`).order('created_at');
      rows=data||[];
    }
    for(const row of rows){
      if(row.id===activeCargoId||nav.querySelector(`[data-v24-child="${row.id}"]`))continue;
      const b=document.createElement('button');
      b.dataset.v24Child=row.id;
      b.textContent=row.id===scopeId?`← ${row.handling_unit_code||row.package_type||'Parent'}`:`↳ ${row.handling_unit_code||row.package_type||'Cargo'}`;
      const inside=nav.querySelector('[data-inside-editor]');
      nav.insertBefore(b,inside||null);
      b.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        activeCargoId=row.id;
        document.querySelector('.wr22-modalback')?.remove();
        modal.remove();
        const edit=main.querySelector(`[data-edit-cargo="${row.id}"]`);
        if(edit)edit.click();
        else main.querySelector(`[data-cargo-select="${row.id}"]`)?.closest('tr')?.click();
      };
    }
  }finally{childNavBusy=false}
}

function editorBackState(){
  const cargoModal=document.querySelector('.wr22-modal')?.querySelector('#c-weight')?.closest('.wr22-modal');
  document.querySelectorAll('.wr22-back').forEach(b=>b.classList.toggle('v24-editor-back',!!cargoModal));
}

function enhanceCargoModal(){
  const modal=document.querySelector('.wr22-modal');
  if(!modal||!modal.querySelector('#c-weight')){editorBackState();return}
  if(!modal.dataset.v24Cargo){
    modal.dataset.v24Cargo='1';
    normalizeCargoInputs(modal);
    syncWeightBasis(modal).catch(()=>{});

    const toggle=modal.querySelector('#v23-weight-each');
    toggle?.addEventListener('change',()=>savePhysicalFields(modal).catch(console.warn));

    const photo=modal.querySelector('#c-photo');
    if(photo){
      photo.addEventListener('click',async e=>{
        e.preventDefault();e.stopImmediatePropagation();
        ensureEvidenceContext();
        try{await savePhysicalFields(modal)}catch(err){console.warn('Physical field save before photo failed',err)}
        const id=await resolveCargoId();
        if(!id)return alert('Could not identify this cargo record.');
        const camera=window.NodaraWRCamera||window.NodaraWRMedia;
        if(!camera?.open)return alert('Cargo camera is still loading. Try again in a second.');
        camera.open({cargoId:id});
      },true);
    }

    const done=modal.querySelector('#c-done');
    if(done){
      done.addEventListener('click',async()=>{
        try{await savePhysicalFields(modal)}catch(err){console.error('Physical field save',err);alert('Could not save weight/dimensions: '+err.message)}
      },true);
    }
  }
  injectChildNavigation(modal);
  editorBackState();
}

function simplifyMobileCargo(){
  if(!matchMedia('(max-width:760px)').matches)return;
  main.querySelectorAll('.wr22-table tbody tr').forEach(row=>{
    if(row.dataset.v24Card)return;
    row.dataset.v24Card='1';
    const edit=row.querySelector('[data-edit-cargo]');
    if(!edit)return;
    row.dataset.openCargo=edit.dataset.editCargo;
    row.querySelector('.wr22-rowactions')?.setAttribute('hidden','');
    row.addEventListener('click',e=>{
      if(e.target.closest('input,button,a'))return;
      activeCargoId=row.dataset.openCargo;
      edit.click();
    });
  });
}

function openReceiptList(){
  document.querySelector('.wr22-modalback')?.remove();
  document.querySelector('.wr22-modal')?.remove();
  if(typeof window.nodaraWRList==='function')return window.nodaraWRList();
  const nav=[...document.querySelectorAll('[data-go="wr"],[data-module="wr"]')][0];
  if(nav)return nav.click();
  window.nodaraSetActive?.('wr');
}

function fixBackButtons(){
  document.querySelectorAll('.wr22-back').forEach(b=>{
    if(!b.dataset.v24Back){
      b.dataset.v24Back='1';
      b.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();openReceiptList()};
    }
  });
  const arrival=main.querySelector('.wr22-arrival');
  if(arrival&&!arrival.querySelector('.v24-arrival-back')){
    const b=document.createElement('button');
    b.className='v24-arrival-back';
    b.innerHTML='← Warehouse receipts';
    b.onclick=e=>{e.preventDefault();openReceiptList()};
    arrival.prepend(b);
  }
  editorBackState();
}

async function syncActiveWRId(){
  const n=receiptNumber();
  if(!n)return;
  if(window.__nodaraActiveWRNumber===n&&window.__nodaraActiveWRId)return;
  const {data}=await supabase.from('warehouse_receipts').select('id').eq('receipt_number',n).maybeSingle();
  if(data?.id){window.__nodaraActiveWRNumber=n;window.__nodaraActiveWRId=data.id}
}

function fixOutputs(){
  main.querySelectorAll('[data-out]').forEach(b=>{
    if(b.dataset.v24Out)return;
    b.dataset.v24Out='1';
    b.addEventListener('click',e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const api=window.NodaraWROutput,id=window.__nodaraActiveWRId;
      if(!api||!id)return alert('WR output tools are still loading. Try again in a second.');
      if(b.dataset.out==='pdf')api.warehouseReceiptPDF?.(id);
      else if(b.dataset.out==='4x6')api.labels4x6?.(id);
      else api.labels2x1?.(id);
    },true);
  });
}

function fixDriverCapture(){
  const b=main.querySelector('[data-driver-id]');
  if(!b||b.dataset.v24Driver)return;
  b.dataset.v24Driver='1';
  b.addEventListener('click',e=>{
    e.preventDefault();e.stopImmediatePropagation();
    ensureEvidenceContext();
    const scanner=window.NodaraWRScanner;
    if(!scanner?.open)return alert('ID capture is still loading. Try again in a second.');
    scanner.open({category:'DRIVER_ID',kind:'DRIVER_ID',analyze:false});
  },true);
}

function rememberCargoClick(e){
  const b=e.target.closest?.('[data-edit-cargo],[data-inside],[data-add-cargo],[data-nav],[data-v24-child]');
  if(!b)return;
  activeCargoId=b.dataset.editCargo||b.dataset.inside||b.dataset.nav||b.dataset.v24Child||activeCargoId;
}
document.addEventListener('click',rememberCargoClick,true);

async function run(){
  ensureEvidenceContext();
  await syncActiveWRId();
  simplifyMobileCargo();
  enhanceCargoModal();
  fixBackButtons();
  fixOutputs();
  fixDriverCapture();
}

new MutationObserver(()=>requestAnimationFrame(()=>run().catch(console.warn))).observe(document.body,{childList:true,subtree:true});
setInterval(()=>run().catch(()=>{}),900);
run().catch(()=>{});
