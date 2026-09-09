const main=document.getElementById('main');
const css=document.createElement('style');css.textContent=`
.wrc-mini-node[data-nav-ready="1"]{cursor:pointer;border:1px solid transparent}.wrc-mini-node[data-nav-ready="1"]:active{border-color:#3d78c6}.wrc-tree-preview-head small{white-space:nowrap}
`;document.head.appendChild(css);

function rows(){return [...main.querySelectorAll('.wrc-table tbody tr')].map((r,i)=>({row:r,i,name:r.querySelector('.wrc-tree b')?.textContent?.trim()||'',meta:r.querySelector('.wrc-tree small')?.textContent?.trim()||'',edit:r.querySelector('[data-edit]')}))}
function enhance(){const preview=document.querySelector('.wrc-tree-preview');if(!preview)return;const rs=rows(),nodes=[...preview.querySelectorAll('.wrc-mini-node')];nodes.forEach((n,i)=>{if(n.dataset.navReady==='1')return;const name=n.querySelector('b')?.textContent?.trim()||'',meta=n.querySelector('small')?.textContent?.trim()||'';let match=rs.find(x=>x.name===name&&x.meta===meta)||rs.find(x=>x.name===name)||rs[i];if(!match?.edit)return;n.dataset.navReady='1';n.title='Tap to edit this cargo level';n.addEventListener('click',()=>{document.getElementById('wrc-close-editor')?.click();setTimeout(()=>{const current=rows().find(x=>x.edit?.dataset.edit===match.edit.dataset.edit);current?.edit?.click()},80)})});const hint=preview.querySelector('.wrc-tree-preview-head small');if(hint)hint.textContent='Tap a level to jump'}
let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(enhance,50)}).observe(document.body,{childList:true,subtree:true});setTimeout(enhance,250);
