const main=document.getElementById('main');

// The canonical WR hierarchy already owns Part number / SKU / Barcode fields.
// This compatibility enhancer now only removes legacy duplicate metadata blocks
// and hides obsolete unit fields. It intentionally does not inject fields or
// attach mutation-driven input listeners.
function cleanCargoFields(){
  const cargo=document.getElementById('cargo');
  if(!cargo?.querySelector('.cargo-hierarchy-v3'))return;
  for(const node of cargo.querySelectorAll('.cargo-tree-node')){
    const nativeMeta=node.querySelector('.cargo-product-meta:not([data-cargo-node-meta])');
    node.querySelectorAll('[data-cargo-node-meta]').forEach(box=>{ if(nativeMeta) box.remove(); });
    const measures=node.querySelector('.cargo-node-grid.measures');
    if(measures){
      for(const field of measures.querySelectorAll('.field')){
        const label=field.querySelector('label')?.textContent?.trim();
        if(['Piece unit','UOM','Units'].includes(label))field.style.display='none';
      }
    }
  }
}
window.addEventListener('nodara:cargo-hierarchy-rendered',cleanCargoFields);
setTimeout(cleanCargoFields,500);
