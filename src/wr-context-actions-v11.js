const main=document.getElementById('main');
let timer=null;
const style=document.createElement('style');
style.textContent=`
.wr11 .wr11-fab,.wr11-fab-menu{display:none!important}.wr11-context-dock{position:fixed;z-index:120;left:50%;transform:translateX(-50%);bottom:calc(78px + env(safe-area-inset-bottom));display:flex;gap:6px;align-items:center;padding:7px;border:1px solid #2b3d55;border-radius:18px;background:#091019e8;backdrop-filter:blur(16px);box-shadow:0 14px 42px #0009;max-width:calc(100vw - 122px)}.wr11-context-dock button{height:42px;min-width:42px;padding:0 11px;border-radius:12px;border:1px solid #2d4058;background:#0d1722;color:#dbe8f5;font-size:11px;white-space:nowrap}.wr11-context-dock button.primary{background:#2477ee;border-color:#438cf2;color:white}.wr11-context-dock button span{font-size:15px;vertical-align:-1px;margin-right:5px}.wr11-context-more{position:fixed;z-index:121;left:50%;transform:translateX(-50%);bottom:calc(130px + env(safe-area-inset-bottom));width:min(360px,calc(100vw - 38px));padding:8px;border:1px solid #2b3d55;border-radius:17px;background:#091019f7;box-shadow:0 18px 50px #000a}.wr11-context-more[hidden]{display:none}.wr11-context-more button{width:100%;text-align:left;min-height:42px;margin:2px 0;border-radius:11px}.wr11 .field-mic,.wr11-modal .field-mic{display:none!important}@media(min-width:900px){.wr11-context-dock{left:auto;right:28px;transform:none;bottom:24px;max-width:none}.wr11-context-more{left:auto;right:28px;transform:none;bottom:78px;width:300px}}@media(max-width:540px){.wr11-context-dock{left:12px;right:92px;transform:none;max-width:none;justify-content:space-between}.wr11-context-dock button{padding:0 10px}.wr11-context-dock .dock-label{display:none}.wr11-context-dock button span{margin-right:0}.wr11-context-more{left:12px;right:92px;transform:none;width:auto}}
`;
document.head.appendChild(style);

function fireFab(name){const b=main.querySelector(`[data-fab="${name}"]`);if(b){b.click();return true}return false}
function directScan(){if(window.nodaraScanTask)return window.nodaraScanTask({title:'Scan receiving',hint:'WR · cargo QR · SKU · part · BOL · PRO · tracking'});if(window.nodaraScan)return window.nodaraScan()}
function directPhoto(){if(window.NodaraWRCamera?.open)return window.NodaraWRCamera.open({cargoId:null});fireFab('photo')}
function directVoice(){if(window.nodaraVoiceCommand)return window.nodaraVoiceCommand();alert('Voice command is unavailable in this browser.')}
function remove(){document.querySelector('.wr11-context-dock')?.remove();document.querySelector('.wr11-context-more')?.remove()}
function mount(){
 if(!main.querySelector('.wr11')){remove();return}
 main.querySelectorAll('.field-mic').forEach(x=>x.remove());
 if(document.querySelector('.wr11-context-dock'))return;
 const dock=document.createElement('div');dock.className='wr11-context-dock';dock.innerHTML=`<button class="primary" data-wrca="scan" title="Scan"><span>▣</span><i class="dock-label">Scan</i></button><button data-wrca="photo" title="Camera"><span>◉</span><i class="dock-label">Photo</i></button><button data-wrca="exception" title="Exception"><span>!</span><i class="dock-label">Issue</i></button><button data-wrca="more" title="More actions"><span>•••</span></button>`;
 const more=document.createElement('div');more.className='wr11-context-more';more.hidden=true;more.innerHTML=`<button data-wrca="cargo">＋ Add cargo</button><button data-wrca="document">▤ Scan document</button><button data-wrca="voice">◌ Voice command</button><button data-wrca="pdf">▧ Generate WR PDF</button>`;
 document.body.append(dock,more);
 const close=()=>more.hidden=true;
 dock.querySelector('[data-wrca="scan"]').onclick=()=>{close();directScan()};
 dock.querySelector('[data-wrca="photo"]').onclick=()=>{close();directPhoto()};
 dock.querySelector('[data-wrca="exception"]').onclick=()=>{close();fireFab('exception')};
 dock.querySelector('[data-wrca="more"]').onclick=()=>more.hidden=!more.hidden;
 more.querySelector('[data-wrca="cargo"]').onclick=()=>{close();fireFab('cargo')};
 more.querySelector('[data-wrca="document"]').onclick=()=>{close();fireFab('scan')};
 more.querySelector('[data-wrca="voice"]').onclick=()=>{close();directVoice()};
 more.querySelector('[data-wrca="pdf"]').onclick=()=>{close();fireFab('pdf')};
 document.addEventListener('click',e=>{if(!more.hidden&&!more.contains(e.target)&&!dock.contains(e.target))more.hidden=true},{capture:true});
}
new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(mount,60)}).observe(main,{childList:true,subtree:true});
setTimeout(mount,250);
