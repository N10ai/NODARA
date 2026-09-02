import { createCargoExplorer } from './cargo-explorer.js';
import { PACKAGE_TYPES } from './cargo-tree-builder.js';

const main=document.getElementById('main');
const nav=document.getElementById('nav');
const mobile=document.getElementById('mobile');
const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const shell=(eye,title,body)=>{main.innerHTML=`<div class="eyebrow">${eye}</div><h1 class="title">${title}</h1>${body}`};
const explorer=createCargoExplorer({main,shell,esc,packageTypes:PACKAGE_TYPES});
window.nodaraCargo=()=>explorer.list();
window.nodaraOpenCargo=id=>explorer.open(id);

function install(){
  if(nav&&!nav.querySelector('[data-cargo-nav]')){
    const b=document.createElement('button');b.textContent='Cargo';b.dataset.cargoNav='1';b.onclick=window.nodaraCargo;
    const inventory=[...nav.querySelectorAll('button')].find(x=>x.textContent.trim()==='Inventory');
    if(inventory)nav.insertBefore(b,inventory);else nav.appendChild(b);
  }
  if(mobile&&!mobile.querySelector('[data-cargo-nav]')){
    const b=document.createElement('button');b.textContent='Cargo';b.dataset.cargoNav='1';b.onclick=window.nodaraCargo;
    const inventory=[...mobile.querySelectorAll('button')].find(x=>x.textContent.trim()==='Inventory');
    if(inventory)mobile.insertBefore(b,inventory);else mobile.appendChild(b);
  }
}
install();
new MutationObserver(install).observe(document.body,{childList:true,subtree:true});
