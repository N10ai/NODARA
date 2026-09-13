const main=document.getElementById('main');
if(!document.getElementById('shipment-stability-v34-style')){
 const s=document.createElement('style');s.id='shipment-stability-v34-style';s.textContent=`
 #main{min-width:0;max-width:100%;overflow-x:hidden}
 #main>*{min-width:0;max-width:100%;box-sizing:border-box}
 #main.txw-active>.shipment-guide,#main.txw-active>#shipment-document-studio{display:none!important}
 #main.txw-active>.record-header.sh31-legacy-hidden,#main.txw-active>.record-section.sh31-legacy-hidden{display:none!important}
 #main.txw-active .txw-shell,#main.txw-active .txw-panel,#main.txw-active .txw-panel>*{min-width:0;max-width:100%;box-sizing:border-box}
 #main.txw-active .txw-row,#main.txw-active .txw-summary-line,#main.txw-active .txw-facts>div{min-width:0}
 #main.txw-active .txw-row>*{min-width:0;overflow-wrap:anywhere}
 .shipment-doc-grid,.shipment-doc-card{min-width:0;max-width:100%;box-sizing:border-box}
 .shipment-doc-card{overflow:hidden}
 .cargo-picker-backdrop{box-sizing:border-box;max-width:100vw;overflow:auto}
 .cargo-picker{box-sizing:border-box;max-width:min(920px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto}
 @media(max-width:760px){
   #main{padding-left:max(14px,env(safe-area-inset-left));padding-right:max(14px,env(safe-area-inset-right));padding-bottom:calc(94px + env(safe-area-inset-bottom))}
   #main .record-commandbar{display:flex;flex-wrap:wrap;gap:8px;max-width:100%}
   #main .record-commandbar>*{min-width:0}
   #main .record-header .title,#main .txw-title{font-size:clamp(28px,9vw,40px);overflow-wrap:anywhere;word-break:break-word}
   #main .detail-grid,#main .txw-edit-grid{grid-template-columns:minmax(0,1fr)!important}
   #main input,#main select,#main textarea,#main button{max-width:100%;box-sizing:border-box}
   .shipment-doc-grid{grid-template-columns:minmax(0,1fr)!important}
   .shipment-doc-card{min-height:0}
   .cargo-picker{width:calc(100vw - 20px);margin:10px auto;max-height:calc(100dvh - 20px)}
 }
 `;document.head.appendChild(s)
}
function clean(){
 if(!main)return;
 const active=main.classList.contains('txw-active')&&main.dataset.txwType==='SHIPMENT';
 if(active){
  main.querySelector(':scope > .shipment-guide')?.setAttribute('aria-hidden','true');
  main.querySelector(':scope > #shipment-document-studio')?.setAttribute('aria-hidden','true');
 }
}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;clean()})}
new MutationObserver(schedule).observe(main,{childList:true});
window.addEventListener('resize',schedule,{passive:true});
queueMicrotask(clean);
