const main=document.getElementById('main');
let cargoBoundHost=null;

function shell(){return main?.querySelector('.shipment-native-shell')}
function purgeLegacy(){
 const s=shell();if(!s)return;
 main.querySelectorAll('#sh-edit,#sh-save,#sh-cancel,#shipment-mode-record,.tx-guidance,.shipment-guide,.sh42-guide').forEach(x=>x.remove());
 main.querySelectorAll(':scope > .record-header,:scope > .record-section').forEach(x=>x.remove());
 main.querySelectorAll('[data-txw-shell]').forEach(x=>{if(x!==s&&!x.classList.contains('shipment-native-shell'))x.remove()});
}
function bindCargo(){
 const s=shell();if(!s||main.dataset.txwTab!=='cargo')return;
 const host=s.querySelector('[data-shipment-cargo-host]');if(!host)return;
 const ws=host.querySelector('.cargo-ws');if(!ws)return;
 const load=ws.querySelector('[data-load-cargo]'),fresh=ws.querySelector('[data-new-cargo]');
 if(load){load.style.display='';load.textContent='＋ Load existing'}
 if(fresh){fresh.style.display='';fresh.textContent='＋ New cargo'}
 // cargo-workspace owns both actions. Do not mount a second editor or remount the workspace.
 cargoBoundHost=host;
}
function reconcile(){purgeLegacy();bindCargo()}
if(main)new MutationObserver(()=>requestAnimationFrame(reconcile)).observe(main,{childList:true,subtree:true});
queueMicrotask(reconcile);
window.nodaraShipmentStabilityV50={reconcile};
