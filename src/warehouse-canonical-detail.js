import { supabase } from './supabase-client.js';
import { loadTransactionReadModel } from './transaction-read-model.js?v=20260907-2';
import { renderCanonicalContract } from './operations-canonical-detail.js?v=20260907-1';

const main=document.getElementById('main');
const cache=new Map();
let run=0,scheduled=false;

async function resolveCurrent(){
  if(!main)return null;
  // Warehouse Receipt core editor.
  if(main.dataset.wrCore==='1'){
    const number=main.querySelector('.wr-modern-title .title')?.textContent?.trim()||main.querySelector('h1.title')?.textContent?.trim();
    if(!number||number==='New Warehouse Receipt')return null;
    const key=`WR:${number}`;
    if(cache.has(key))return cache.get(key);
    const{data,error}=await supabase.from('warehouse_receipts').select('id').eq('receipt_number',number).maybeSingle();
    if(error)throw error;
    const hit=data?.id?{type:'WAREHOUSE_RECEIPT',id:data.id,key}:null;
    if(hit)cache.set(key,hit);
    return hit;
  }
  // Cargo Release detail screen.
  if(main.querySelector('#crc-back')&&main.querySelector('.record-number')){
    const number=main.querySelector('.record-number')?.textContent?.trim();
    if(!number)return null;
    const key=`CR:${number}`;
    if(cache.has(key))return cache.get(key);
    const{data,error}=await supabase.from('cargo_releases').select('id').eq('release_number',number).maybeSingle();
    if(error)throw error;
    const hit=data?.id?{type:'CARGO_RELEASE',id:data.id,key}:null;
    if(hit)cache.set(key,hit);
    return hit;
  }
  return null;
}

async function enhance(){
  scheduled=false;
  const token=++run;
  if(!main||main.querySelector('.canonical-contract'))return;
  try{
    const current=await resolveCurrent();
    if(!current||token!==run||main.querySelector('.canonical-contract'))return;
    let model=cache.get(`${current.key}:model`);
    if(!model){
      model=await loadTransactionReadModel(current.type,current.id);
      if(model)cache.set(`${current.key}:model`,model);
    }
    if(!model||token!==run||main.querySelector('.canonical-contract'))return;
    main.insertAdjacentHTML('beforeend',renderCanonicalContract(model));
  }catch(error){
    console.warn('[NODARA] warehouse canonical transaction detail unavailable',error);
  }
}

function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(enhance)}
if(main){new MutationObserver(schedule).observe(main,{childList:true,subtree:true});schedule()}

export function invalidateWarehouseCanonical(type,number){
  const key=`${String(type||'').toUpperCase()}:${number}`;
  cache.delete(key);cache.delete(`${key}:model`);schedule();
}

window.nodaraWarehouseCanonicalDetail={enhance,invalidate:invalidateWarehouseCanonical};
