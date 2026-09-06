import './cargo-workspace.js';
import './transaction-cargo-workspaces.js';
import './cargo-loader-smart-search.js';
if(!document.querySelector('link[data-cargo-workspace-css]')){const l=document.createElement('link');l.rel='stylesheet';l.href='cargo-workspace.css?v=20260905-2215';l.dataset.cargoWorkspaceCss='1';document.head.appendChild(l)}
import { createCargoExplorer } from './cargo-explorer.js';
import { PACKAGE_TYPES } from './cargo-tree-builder.js';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const shell=(eye,title,body)=>{main.innerHTML=`<div class="eyebrow">${eye}</div><h1 class="title">${title}</h1>${body}`};
const explorer=createCargoExplorer({main,shell,esc,packageTypes:PACKAGE_TYPES});
window.nodaraCargo=()=>explorer.list();
window.nodaraOpenCargo=id=>explorer.open(id);
