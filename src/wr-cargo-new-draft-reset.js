const main=document.getElementById('main');

function clearLegacyRoots(attempt=0){
  const cargo=main.querySelector('#cargo');
  const hierarchy=cargo?.querySelector('.cargo-hierarchy-v3');
  if(!cargo||!main.querySelector('.wr-object-head'))return;
  if(!hierarchy){
    if(attempt<12)setTimeout(()=>clearLegacyRoots(attempt+1),60);
    return;
  }
  const remove=hierarchy.querySelector('[data-remove-root]');
  if(remove){
    remove.click();
    if(attempt<40)setTimeout(()=>clearLegacyRoots(attempt+1),0);
    return;
  }
  window.__nodaraCargoDraftDetails={roots:[],measurement_units:{weight:'KG',dimensions:'IN'},totals:{outerQty:0,rootCount:0,gross:0,grossKg:0,cbm:0,cft:0,volumetric:0,volumetricKg:0,chargeable:0,chargeableKg:0},packages:{},items:[],itemCursor:0};
  window.dispatchEvent(new CustomEvent('nodara:cargo-hierarchy-rendered',{detail:{rootCount:0}}));
}

window.addEventListener('nodara:new-wr-draft',()=>clearLegacyRoots());
