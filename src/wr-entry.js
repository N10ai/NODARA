import { createGuidedWR } from './wr-guided.js?v=20260901-2031';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const baseShell=(eye,title,body)=>{main.innerHTML=`<div class="eyebrow">${eye}</div><h1 class="title">${title}</h1>${body}`};
let currentTitle='New Warehouse Receipt';
function recordShell(eye,title,body){
  currentTitle=title||currentTitle;
  main.innerHTML=`<div class="wr-compose-head"><div><div class="eyebrow">Warehouse Receipt · Draft</div><h1 class="title">${esc(currentTitle)}</h1></div><span class="status-pill draft">Draft</span></div><div class="record-tabs wr-compose-tabs"><button class="active" data-compose-tab="overview">Overview</button><button data-compose-tab="cargo">Cargo</button><button data-compose-tab="references">References</button><button data-compose-tab="documents">Documents</button><button data-compose-tab="charges">Charges</button></div><div class="wr-compose-context"><span class="wr-context-step">${esc(eye)}</span><span>Building one warehouse receipt</span></div><div id="wr-compose-stage">${body}</div>`;
  main.querySelectorAll('[data-compose-tab]').forEach(b=>b.onclick=()=>{
    const target=b.dataset.composeTab;
    if(target==='cargo')document.getElementById('wr-compose-stage')?.scrollIntoView({behavior:'smooth'});
    else if(target!=='overview')alert(`${b.textContent.trim()} is part of this WR and will populate here as the receipt is built.`);
  });
}
const guided=createGuidedWR({main,shell:recordShell,esc});
window.nodaraReceive=()=>guided.start();

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-go="receive"]');
  if(!btn)return;
  e.preventDefault();e.stopImmediatePropagation();guided.start();
},true);
