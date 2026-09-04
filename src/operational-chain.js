import { supabase } from './supabase-client.js';
import { openRecord as openCRRecord } from './cr-workspace-v2.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString():'—';
const LABELS={TRANSPORT_ORDER:'Transport',WAREHOUSE_RECEIPT:'Warehouse Receipt',SHIPMENT:'Shipment',CARGO_RELEASE:'Cargo Release'};
const ICONS={TRANSPORT_ORDER:'🚚',WAREHOUSE_RECEIPT:'▣',SHIPMENT:'↗',CARGO_RELEASE:'→'};

async function fetchRecord(type,id){
  const map={
    TRANSPORT_ORDER:['transport_orders','id,order_number,order_type,status,created_at'],
    WAREHOUSE_RECEIPT:['warehouse_receipts','id,receipt_number,status,created_at'],
    SHIPMENT:['shipments','id,shipment_number,mode,status,created_at'],
    CARGO_RELEASE:['cargo_releases','id,release_number,status,created_at']
  };
  const spec=map[type];if(!spec)return null;
  const {data}=await supabase.from(spec[0]).select(spec[1]).eq('id',id).maybeSingle();
  if(!data)return null;
  const number=data.order_number||data.receipt_number||data.shipment_number||data.release_number||id;
  const subtype=data.order_type||data.mode||'';
  return {type,id,number,status:data.status||'',subtype,created_at:data.created_at};
}
async function directLinks(type,id){
  const {data,error}=await supabase.from('operational_links').select('*').or(`and(source_type.eq.${type},source_id.eq.${id}),and(target_type.eq.${type},target_id.eq.${id})`).order('created_at');
  if(error)return [];
  return data||[];
}
export async function resolveOperationalChain(type,id){
  const root=await fetchRecord(type,id);if(!root)return [];
  const seen=new Map([[`${type}:${id}`,root]]),queue=[{type,id}],edges=[];
  while(queue.length&&seen.size<20){
    const cur=queue.shift(),links=await directLinks(cur.type,cur.id);
    for(const l of links){
      edges.push(l);
      const other=l.source_type===cur.type&&l.source_id===cur.id?{type:l.target_type,id:l.target_id}:{type:l.source_type,id:l.source_id};
      const key=`${other.type}:${other.id}`;
      if(!seen.has(key)){const rec=await fetchRecord(other.type,other.id);if(rec){seen.set(key,rec);queue.push(other)}}
    }
  }
  const rank={TRANSPORT_ORDER:1,WAREHOUSE_RECEIPT:2,SHIPMENT:3,CARGO_RELEASE:4};
  const items=[...seen.values()].sort((a,b)=>(rank[a.type]||9)-(rank[b.type]||9)||new Date(a.created_at||0)-new Date(b.created_at||0));
  return items.map(x=>({...x,current:x.type===type&&x.id===id}));
}
export function renderOperationalChain(items,{title='Operational Chain'}={}){
  if(!items?.length)return `<div class="empty compact">No linked operational records yet.</div>`;
  return `<div class="op-chain" role="list" aria-label="${esc(title)}">${items.map((x,i)=>`<button type="button" class="op-chain-node ${x.current?'current':''}" data-op-type="${esc(x.type)}" data-op-id="${esc(x.id)}"><span class="op-chain-icon">${ICONS[x.type]||'•'}</span><span class="op-chain-copy"><small>${esc(x.subtype||LABELS[x.type]||x.type)}</small><b>${esc(x.number)}</b><em>${esc(x.status||'—')}</em></span>${i<items.length-1?'<span class="op-chain-arrow">›</span>':''}</button>`).join('')}</div>`;
}
export async function openOperationalRecord(type,id){
  if(type==='WAREHOUSE_RECEIPT')return window.nodaraWROpen?.(id);
  if(type==='CARGO_RELEASE')return openCRRecord(id);
  if(type==='SHIPMENT')return window.nodaraOpenShipment?.(id)||window.nodaraOperations?.shipments?.();
  if(type==='TRANSPORT_ORDER')return window.nodaraOpenTransportOrder?.(id)||window.nodaraOperations?.transportOrders?.();
}
export function bindOperationalChain(root=document){
  root.querySelectorAll?.('[data-op-type][data-op-id]').forEach(b=>{if(b.dataset.opBound)return;b.dataset.opBound='1';b.onclick=()=>openOperationalRecord(b.dataset.opType,b.dataset.opId)});
}
window.nodaraOperationalChain={resolve:resolveOperationalChain,render:renderOperationalChain,bind:bindOperationalChain,open:openOperationalRecord};
