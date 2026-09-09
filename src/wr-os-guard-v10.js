const main=document.getElementById('main');
const css=document.createElement('style');css.textContent=`
#main[data-wr-canonical="1"] .wr-next-work,
#main[data-wr-canonical="1"] .wrv4-exec,
#main[data-wr-canonical="1"] .wrn-visit,
#main[data-wr-canonical="1"] .wrx-tools,
#main[data-wr-canonical="1"] .wr-completion-panel,
#main[data-wr-canonical="1"] .wrn-cargo-mobile,
#main[data-wr-canonical="1"] .record-tabs,
#main[data-wr-canonical="1"] [data-wrn-tab]{display:none!important}
`;document.head.appendChild(css);
function clean(){if(main?.dataset?.wrCanonical!=='1')return;main.querySelectorAll('.wr-next-work,.wrv4-exec,.wrn-visit,.wrx-tools,.wr-completion-panel,.wrn-cargo-mobile').forEach(x=>x.remove())}
let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(clean,30)}).observe(main,{childList:true,subtree:true});setTimeout(clean,300);
