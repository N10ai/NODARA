import { createInventoryExplorer } from './inventory-explorer.js';
import { PACKAGE_TYPES } from './cargo-tree-builder.js';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const shell=(eye,title,body)=>{main.innerHTML=`<div class="eyebrow">${eye}</div><h1 class="title">${title}</h1>${body}`};
const explorer=createInventoryExplorer({main,shell,esc,packageTypes:PACKAGE_TYPES});
window.nodaraInventoryExplorer=explorer;

document.addEventListener('click',e=>{
  const button=e.target.closest?.('[data-go="inventory"]');
  if(!button)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  explorer.list();
},true);
