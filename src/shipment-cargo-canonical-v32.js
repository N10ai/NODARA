import { supabase } from './supabase-client.js';
import { mountCargoWorkspace } from './cargo-workspace.js?v=20260913-v32';

const main=document.getElementById('main');
const directionLabel=v=>({EXPORT:'Export',IMPORT:'Import',CROSS_TRADE:'Foreign → Foreign',DOMESTIC:'Domestic'}[String(v||'').toUpperCase()]||v||'Not set');
let busy=false,lastDirectionId='';

function shipmentContext(){
 if(!main?.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return null;
 const shell=main.querySelector('[data-txw-shell^="SHIPMENT:"]');
 if(!shell)return null;
 const id=String(shell.dataset.txwShell||'').split(':')[1];
 if(!id)return null;
 return{shell,id,panel:shell.querySelector('[data-txw-panel]')};
}

async function ensureDirection(ctx){
 if(!ctx||ctx.shell.querySelector('[data-sh32-direction]')||lastDirectionId===ctx.id)return;
 lastDirectionId=ctx.id;
 try{
  const{data,error}=await supabase.from('shipments').select('direction').eq('id',ctx.id).maybeSingle();
  if(error||!data)return;
  const sub=ctx.shell.querySelector('.txw-sub');
  if(!sub)return;
  const chip=document.createElement('span');chip.dataset.sh32Direction='';chip.className='sh32-direction-chip';chip.textContent=directionLabel(data.direction);sub.insertAdjacentElement('afterend',chip);
 }finally{if(!ctx.shell.querySelector('[data-sh32-direction]'))lastDirectionId=''}
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
 ctx.panel.innerHTML=`<div class="sh32-cargo-intro"><div><b>Shipment cargo</b><small>Load warehouse cargo or create cargo that exists only on this forwarding file.</small></div></div><div data-sh32-cargo-mount></div>`;
 await mountCargoWorkspace(ctx.panel.querySelector('[data-sh32-cargo-mount]'),{transactionType:'SHIPMENT',transactionId:ctx.id,title:'Shipment Cargo',allowAdd:true});
}

async function tick(){
 if(busy)return;const ctx=shipmentContext();if(!ctx)return;busy=true;
 try{hideDuplicateCargo(ctx);await ensureDirection(ctx);await mountCanonicalCargo(ctx)}catch(e){console.warn('[NODARA] canonical shipment cargo',e)}finally{busy=false}
}

document.addEventListener('click',e=>{if(e.target.closest?.('[data-txw-tab="cargo"]'))setTimeout(tick,0)},true);
new MutationObserver(()=>queueMicrotask(tick)).observe(main,{childList:true,subtree:true});
queueMicrotask(tick);
