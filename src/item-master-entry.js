import './item-master.js?v=20260902-1835';
const main=document.getElementById('main');
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-subroute="settings_items"],[data-open-part-master]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();window.nodaraItemMaster?.()},true);
function inject(){if(window.__nodaraRoute!=='inventory')return;const title=[...main.querySelectorAll('h1.title')].find(x=>/inventory/i.test(x.textContent||''));if(!title||main.querySelector('[data-open-part-master]'))return;const bar=document.createElement('div');bar.className='context-actions inventory-master-switch';bar.innerHTML='<button class="secondary compact-btn" data-open-part-master>Part Master</button>';title.parentElement?.appendChild(bar)}
new MutationObserver(()=>requestAnimationFrame(inject)).observe(main,{childList:true,subtree:true});setTimeout(inject,350);
