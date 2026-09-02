const main=document.getElementById('main');
let bypassOnce=false,pending=false;
function hasHierarchy(){return Array.isArray(window.__nodaraCargoDraftDetails?.roots)&&window.__nodaraCargoDraftDetails.roots.length>0}
function hasHierarchyItems(){const roots=window.__nodaraCargoDraftDetails?.roots||[];let found=false;const walk=n=>{for(const c of n.children||[]){if(c.type==='ITEM'&&(c.inventory_item_id||c.part_number||c.sku||c.barcode||c.description))found=true;else walk(c)}};roots.forEach(walk);return found}
function forceLegacyPackageMode(){const btn=main.querySelector('[data-mode="package"]');if(btn)btn.click()}
function retrySave(){let tries=0;const run=()=>{const save=document.getElementById('wr-save');if(save&&hasHierarchy()){bypassOnce=true;save.click();pending=false;return}if(++tries<12)requestAnimationFrame(run);else pending=false};requestAnimationFrame(()=>requestAnimationFrame(run))}
document.addEventListener('click',e=>{const save=e.target.closest?.('#wr-save');if(!save)return;if(bypassOnce){bypassOnce=false;return}if(!hasHierarchy()||pending)return;pending=true;e.preventDefault();e.stopImmediatePropagation();window.dispatchEvent(new CustomEvent('nodara:prepare-hierarchy-save',{detail:{hasItems:hasHierarchyItems()}}));forceLegacyPackageMode();retrySave()},true);
