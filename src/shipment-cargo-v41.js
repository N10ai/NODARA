import { mountCargoWorkspace } from './cargo-workspace.js?v=20260913-v41';

const main=document.getElementById('main');

function ctx(){
 if(!main?.classList.contains('txw-active')||main.dataset.txwType!=='SHIPMENT')return null;
 const shell=main.querySelector('[data-txw-shell^="SHIPMENT:"]');if(!shell)return null;
 const id=String(shell.dataset.txwShell||'').split(':')[1],panel=shell.querySelector('[data-txw-panel]');
 return id&&panel?{shell,id,panel}:null;
}

async function renderCargo(){
 const c=ctx();if(!c)return;
 c.shell.querySelectorAll('[data-txw-tab]').forEach(b=>b.classList.toggle('active',b.dataset.txwTab==='cargo'));
 main.dataset.txwTab='cargo';
 c.panel.innerHTML='<div class="txw-empty">Loading shipment cargo…</div>';
 await mountCargoWorkspace(c.panel,{transactionType:'SHIPMENT',transactionId:c.id,title:'Shipment Cargo',allowAdd:true});
}

// Shipment Cargo has exactly one owner. Stop the generic transaction tab renderer here.
window.addEventListener('click',e=>{
 const tab=e.target.closest?.('[data-txw-tab="cargo"]');if(!tab||!ctx())return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 renderCargo();
},true);

setTimeout(()=>{if(main?.dataset.txwType==='SHIPMENT'&&main.dataset.txwTab==='cargo')renderCargo()},350);
window.nodaraShipmentCargoV41={render:renderCargo};
