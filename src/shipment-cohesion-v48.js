// Shipment cohesion guard: one canonical record, no legacy edit layer.
const main=document.getElementById('main');

function canonical(){return main?.querySelector('.shipment-native-shell')}
function removeLegacyEdit(){
 const shell=canonical();if(!shell)return;
 const edit=main.querySelector('#sh-edit');if(edit)edit.remove();
 main.querySelectorAll(':scope > .record-header,:scope > .record-section,#shipment-mode-record').forEach(x=>x.remove());
}
function tightenPartyMenus(){
 const shell=canonical();if(!shell)return;
 shell.querySelectorAll('.shipment-parties .nr-resolver').forEach(root=>{
  if(root.dataset.shipmentTight==='1')return;root.dataset.shipmentTight='1';
  const input=root.querySelector('.nr-input'),menu=root.querySelector('.nr-menu');if(!input||!menu)return;
  const sync=()=>{const q=input.value.trim();if(q.length<1)menu.hidden=true};
  input.addEventListener('focus',sync,true);input.addEventListener('input',sync,true);
 });
}
function cargoGuard(){
 const shell=canonical();if(!shell||main.dataset.txwTab!=='cargo')return;
 const host=shell.querySelector('[data-shipment-cargo-host]');if(!host)return;
 // Canonical cargo workspace is the only shipment cargo surface.
 shell.querySelectorAll('.shipment-cargo .cargo-ws').forEach((x,i)=>{if(i>0)x.remove()});
}
function reconcile(){removeLegacyEdit();tightenPartyMenus();cargoGuard()}

document.addEventListener('click',e=>{
 const edit=e.target.closest?.('#sh-edit');if(edit&&canonical()){
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  canonical().querySelector('[data-txw-tab="overview"]')?.click();return;
 }
},true);
if(main)new MutationObserver(()=>queueMicrotask(reconcile)).observe(main,{childList:true,subtree:true});
queueMicrotask(reconcile);
window.nodaraShipmentCohesionV48={reconcile};
