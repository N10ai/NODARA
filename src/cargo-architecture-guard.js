const main=document.getElementById('main');
const isWR=()=>/^WR/i.test(main.querySelector('.record-number')?.textContent?.trim()||main.querySelector('.record-header .title')?.textContent?.trim()||'')||!!main.querySelector('.wr-object-head');
function clean(){
  if(!isWR()){
    main.querySelectorAll('[data-new-cargo],#shipment-add-root').forEach(b=>{b.style.display='none';b.setAttribute('aria-hidden','true')});
    const shipmentBox=document.getElementById('shipment-draft-cargo');
    if(shipmentBox&&!shipmentBox.querySelector('.hu-boundary-note')){
      const n=document.createElement('div');n.className='notice compact hu-boundary-note';n.innerHTML='<b>Expected cargo only.</b> Physical Handling Units are created when cargo is received into a Warehouse Receipt. Use Convert to WR when this cargo arrives at the warehouse.';shipmentBox.prepend(n);
    }
  }
  document.querySelectorAll('.cargo-wr-group').forEach(g=>{const title=g.querySelector('.cargo-wr-title b')?.textContent?.trim().toLowerCase()||'';if(title==='other reusable cargo'||title==='other cargo')g.remove()});
  document.querySelectorAll('.cargo-picker .section-heading span').forEach(s=>{if(/create cargo only for this transaction/i.test(s.textContent||''))s.textContent='Load existing physical cargo from a Warehouse Receipt. New Handling Units are created only through receiving.'});
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-new-cargo],#shipment-add-root');
  if(b&&!isWR()){e.preventDefault();e.stopImmediatePropagation();alert('Handling Units are created from a Warehouse Receipt. Convert this inbound record to a WR first.');}
},true);
new MutationObserver(()=>requestAnimationFrame(clean)).observe(document.body,{childList:true,subtree:true});
setTimeout(clean,350);
