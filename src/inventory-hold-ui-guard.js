import { supabase } from './supabase-client.js';
let activeNodeId=null;
document.addEventListener('click',e=>{const row=e.target.closest?.('[data-ledger-node]');if(row)activeNodeId=row.dataset.ledgerNode},true);
const observer=new MutationObserver(()=>{
 const sheet=document.querySelector('.inventory-action-sheet');
 const hold=sheet?.querySelector('[data-ia="hold"]');
 if(!hold||hold.dataset.canonicalHoldBound||!activeNodeId)return;
 hold.dataset.canonicalHoldBound='1';hold.disabled=true;
 const nodeId=activeNodeId;
 supabase.from('cargo_units').select('id,inventory_item_id,metadata').eq('id',nodeId).single().then(({data,error})=>{
  if(error||!data){hold.disabled=false;return}
  let held=data.metadata?.inventory_hold===true;
  hold.innerHTML=`<b>${held?'Release hold':'Place on hold'}</b><small>${held?'Return cargo to allocatable inventory':'Remove cargo from available inventory'}</small>`;
  hold.disabled=false;
  hold.addEventListener('click',async e=>{
   e.preventDefault();e.stopImmediatePropagation();
   const reason=prompt(held?'Reason for releasing hold:':'Reason for hold:')||'';if(!reason)return;
   hold.disabled=true;
   const{error:rpcError}=await supabase.rpc('inventory_set_hold',{p_cargo_unit_id:nodeId,p_hold:!held,p_reason:reason,p_notes:null});
   if(rpcError){hold.disabled=false;return alert(rpcError.message)}
   held=!held;document.querySelector('.inventory-action-overlay')?.remove();await window.nodaraInventoryLedger?.open?.();
  },true);
  const repack=sheet.querySelector('[data-ia="repack"]');
  if(repack&&!data.inventory_item_id){repack.disabled=true;repack.title='Select an inventory-linked contained cargo level to repack.'}
 });
});
observer.observe(document.body,{childList:true,subtree:true});
