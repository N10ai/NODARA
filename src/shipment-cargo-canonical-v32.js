import { supabase } from './supabase-client.js';
import { mountCargoWorkspace } from './cargo-workspace.js?v=20260913-v32';

const main=document.getElementById('main');
const directions=[['EXPORT','Export'],['IMPORT','Import'],['CROSS_TRADE','Foreign → Foreign'],['DOMESTIC','Domestic']];
const directionLabel=v=>Object.fromEntries(directions)[String(v||'').toUpperCase()]||v||'Not set';
let busy=false,lastDirectionId='';

function shipmentContext(){
 if(!main?.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return null;
 const shell=main.querySelector('[data-txw-shell^="SHIPMENT:"]');
 if(!shell)return null;
 const id=String(shell.dataset.txwShell||'').split(':')[1];
 if(!id)return null;
 return{shell,id,panel:shell.querySelector('[data-txw-panel]')};
}

async function saveDirection(id,value){
 const{error}=await supabase.from('shipments').update({direction:value,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;
}

function directionButton(ctx,value){
 const b=document.createElement('button');b.type='button';b.dataset.sh32Direction='';b.className='sh32-direction-chip';b.textContent=directionLabel(value);b.title='Change shipment direction';
 b.onclick=()=>{
  const select=document.createElement('select');select.className='sh32-direction-select';select.innerHTML=directions.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('');b.replaceWith(select);select.focus();
  let done=false;const finish=async save=>{if(done)return;done=true;let next=value;try{if(save){next=select.value;await saveDirection(ctx.id,next)}}catch(e){alert(e.message||'Could not change direction')}finally{select.replaceWith(directionButton(ctx,next))}};
  select.onchange=()=>finish(true);select.onblur=()=>setTimeout(()=>finish(false),80);select.onkeydown=e=>{if(e.key==='Escape')finish(false)};
 };
 return b;
}

async function ensureDirection(ctx){
 if(!ctx||ctx.shell.querySelector('[data-sh32-direction],.sh32-direction-select')||lastDirectionId===ctx.id)return;
 lastDirectionId=ctx.id;
 try{
  const{data,error}=await supabase.from('shipments').select('direction').eq('id',ctx.id).maybeSingle();
  if(error||!data)return;
  const sub=ctx.shell.querySelector('.txw-sub');if(!sub)return;
  sub.insertAdjacentElement('afterend',directionButton(ctx,String(data.direction||'')));
 }finally{if(!ctx.shell.querySelector('[data-sh32-direction],.sh32-direction-select'))lastDirectionId=''}
}

function hideDuplicateCargo(ctx){
 if(!ctx)return;
 for(const sec of main.querySelectorAll(':scope > [data-canonical-cargo],:scope > .record-section[data-canonical-cargo]'))sec.classList.add('sh32-duplicate-cargo');
}

async function mountCanonicalCargo(ctx){
 if(!ctx?.panel)return;
 const active=ctx.shell.querySelector('[data-txw-tab="cargo"].active')||main.dataset.txwTab==='cargo';
 if(!active)return;
 if(ctx.panel.dataset.sh32CargoFor===ctx.id)return;
 ctx.panel.dataset.sh32CargoFor=ctx.id;
 ctx.panel.innerHTML=`<div class="sh32-cargo-intro"><div><b>Shipment cargo</b><small>Cargo does not have to be in your warehouse. Load existing WR/reusable cargo, or create cargo directly for this forwarding file.</small></div></div><div data-sh32-cargo-mount></div>`;
 const mount=ctx.panel.querySelector('[data-sh32-cargo-mount]');
 await mountCargoWorkspace(mount,{transactionType:'SHIPMENT',transactionId:ctx.id,title:'Shipment Cargo',allowAdd:true});
 const load=mount.querySelector('[data-load-cargo]'),fresh=mount.querySelector('[data-new-cargo]');
 if(load){load.textContent='+ From WR / existing cargo';load.title='Assign cargo already known to NODARA'}
 if(fresh){fresh.textContent='+ Create shipment cargo';fresh.title='Create cargo for this shipment without a Warehouse Receipt'}
}

async function tick(){
 if(busy)return;const ctx=shipmentContext();if(!ctx)return;busy=true;
 try{hideDuplicateCargo(ctx);await ensureDirection(ctx);await mountCanonicalCargo(ctx)}catch(e){console.warn('[NODARA] canonical shipment cargo',e)}finally{busy=false}
}

document.addEventListener('click',e=>{if(e.target.closest?.('[data-txw-tab="cargo"]'))setTimeout(tick,0)},true);
new MutationObserver(()=>queueMicrotask(tick)).observe(main,{childList:true,subtree:true});
queueMicrotask(tick);
