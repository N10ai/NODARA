import { createGuidedWR } from './wr-guided.js?v=20260901-1955';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const shell=(eye,title,body)=>{main.innerHTML=`<div class="eyebrow">${eye}</div><h1 class="title">${title}</h1>${body}`};
const guided=createGuidedWR({main,shell,esc});

window.nodaraReceive=()=>guided.start();

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-go="receive"]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  guided.start();
},true);
