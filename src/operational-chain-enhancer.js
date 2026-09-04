import { supabase } from './supabase-client.js';
import { resolveOperationalChain,renderOperationalChain,bindOperationalChain } from './operational-chain.js';

const main=document.getElementById('main');
let timer=null,lastKey='';
function currentDescriptor(){
  const title=main?.querySelector('.record-header h1.title,.cr-record-head h1.title,.wr-record-header h1.title,h1.title')?.textContent?.trim();
  if(!title)return null;
  if(/^CR-/i.test(title))return {type:'CARGO_RELEASE',field:'release_number',table:'cargo_releases',number:title};
  if(/^WR-/i.test(title))return {type:'WAREHOUSE_RECEIPT',field:'receipt_number',table:'warehouse_receipts',number:title};
  if(/^(PU|DL|TR|DR)-/i.test(title))return {type:'TRANSPORT_ORDER',field:'order_number',table:'transport_orders',number:title};
  if(/^(AIR|OCN|GRD)-/i.test(title))return {type:'SHIPMENT',field:'shipment_number',table:'shipments',number:title};
  return null;
}
async function resolveId(d){const {data}=await supabase.from(d.table).select('id').eq(d.field,d.number).maybeSingle();return data?.id||null}
async function enhance(){
  const d=currentDescriptor();if(!d)return;
  const id=await resolveId(d);if(!id)return;
  const key=`${d.type}:${id}`;if(key===lastKey&&main.querySelector('.op-chain-section'))return;
  const items=await resolveOperationalChain(d.type,id);if(!items.length)return;
  lastKey=key;
  const existing=main.querySelector('.op-chain-section');if(existing)existing.remove();
  const section=document.createElement('section');section.className='record-section op-chain-section';
  section.innerHTML=`<div class="section-heading"><div><h3>Operational Chain</h3><span class="muted">Linked transactions across receiving, forwarding, release and delivery.</span></div></div>${renderOperationalChain(items)}`;
  const raw=main.querySelector('.ops-link-list');
  if(raw){const holder=raw.closest('.record-section');holder?.replaceWith(section)}
  else{
    const header=main.querySelector('.record-header,.cr-record-head,.wr-record-header');
    if(header)header.insertAdjacentElement('afterend',section);else main.prepend(section);
  }
  bindOperationalChain(section);
}
const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>enhance().catch(()=>{}),120)});
if(main)observer.observe(main,{childList:true,subtree:true});
setTimeout(()=>enhance().catch(()=>{}),500);
window.nodaraRefreshOperationalChain=()=>{lastKey='';enhance().catch(()=>{})};
