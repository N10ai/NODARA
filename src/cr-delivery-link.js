import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deliveryNumber=()=>`DL-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${String(Date.now()).slice(-4)}`;

async function currentCR(){
  const number=main.querySelector('.cr-record-head h1.title')?.textContent?.trim();
  if(!number)return null;
  const {data,error}=await supabase.from('cargo_releases').select('*').eq('release_number',number).maybeSingle();
  if(error)throw error;
  return data;
}

async function getConsigneeName(id){
  if(!id)return null;
  const {data}=await supabase.from('entities').select('name').eq('id',id).maybeSingle();
  return data?.name||null;
}

async function releaseQty(id){
  const {data,error}=await supabase.from('cargo_release_lines').select('requested_quantity').eq('cargo_release_id',id);
  if(error)throw error;
  return (data||[]).reduce((a,x)=>a+Number(x.requested_quantity||0),0);
}

async function existingDelivery(cr){
  const {data,error}=await supabase.from('operational_links').select('target_id').eq('organization_id',cr.organization_id).eq('source_type','CARGO_RELEASE').eq('source_id',cr.id).eq('target_type','TRANSPORT_ORDER').eq('relationship','DELIVERY_ORDER').limit(1);
  if(error)throw error;
  return data?.[0]?.target_id||null;
}

async function createDelivery(){
  const btn=document.getElementById('cr-create-delivery');
  try{
    const cr=await currentCR();
    if(!cr)return alert('Could not resolve this Cargo Release.');
    const existing=await existingDelivery(cr);
    if(existing){
      if(confirm('A Delivery is already linked to this Cargo Release. Open Deliveries?'))window.nodaraOperations?.transportOrders?.('DELIVERY');
      return;
    }
    if(!confirm(`Create a Delivery order from ${cr.release_number}? Customer, consignee, carrier, schedule, driver, vehicle and release quantity will be carried forward.`))return;
    if(btn){btn.disabled=true;btn.textContent='Creating Delivery…'}
    const [consignee,qty]=await Promise.all([getConsigneeName(cr.consignee_id),releaseQty(cr.id)]);
    const payload={
      organization_id:cr.organization_id,
      order_number:deliveryNumber(),
      order_type:'DELIVERY',
      status:'DRAFT',
      customer_id:cr.customer_id||null,
      carrier_id:cr.carrier_id||null,
      delivery_entity_id:cr.consignee_id||null,
      pickup_name:'Warehouse',
      delivery_name:consignee||null,
      scheduled_start:cr.scheduled_at||null,
      pieces:qty||null,
      driver_name:cr.driver_name||null,
      vehicle_reference:cr.vehicle_reference||null,
      customer_reference:cr.reference||cr.release_number,
      instructions:cr.instructions||null,
      currency:'USD',
      metadata:{created_from:'cargo_release',cargo_release_number:cr.release_number}
    };
    const {data:order,error}=await supabase.from('transport_orders').insert(payload).select().single();
    if(error)throw error;
    const {error:linkError}=await supabase.from('operational_links').insert({
      organization_id:cr.organization_id,
      source_type:'CARGO_RELEASE',source_id:cr.id,
      target_type:'TRANSPORT_ORDER',target_id:order.id,
      relationship:'DELIVERY_ORDER',
      metadata:{cargo_release_number:cr.release_number,transport_order_number:order.order_number,created_from:'cr_delivery_workflow'}
    });
    if(linkError)throw linkError;
    window.nodaraOperations?.transportOrders?.('DELIVERY');
  }catch(e){
    alert(e.message||String(e));
    if(btn){btn.disabled=false;btn.textContent='Create Delivery'}
  }
}

async function renderChain(card,cr){
  try{
    const {data}=await supabase.from('operational_links').select('*').or(`and(source_type.eq.CARGO_RELEASE,source_id.eq.${cr.id}),and(target_type.eq.CARGO_RELEASE,target_id.eq.${cr.id})`).order('created_at');
    card.innerHTML=`<div class="section-heading"><div><h3>Operational Chain</h3><span class="muted">Release, delivery and downstream records stay connected without duplicate entry.</span></div></div><div class="ops-link-list">${(data||[]).map(l=>`<div><b>${esc(String(l.relationship||'LINK').replaceAll('_',' '))}</b><span>${esc(l.source_type)} → ${esc(l.target_type)}</span></div>`).join('')||'<div class="empty compact">No linked operational records yet.</div>'}</div>`;
  }catch{}
}

async function enhance(){
  if(!main.querySelector('.cr-record-head')||document.getElementById('cr-create-delivery'))return;
  const command=main.querySelector('.cr-commandbar .context-actions');
  if(command){
    const b=document.createElement('button');b.id='cr-create-delivery';b.className='secondary compact-btn';b.textContent='Create Delivery';b.onclick=createDelivery;
    const edit=command.querySelector('#crv2-edit');command.insertBefore(b,edit||null);
  }
  const cr=await currentCR();
  if(cr&&!document.getElementById('cr-operational-chain')){
    const card=document.createElement('section');card.className='record-section';card.id='cr-operational-chain';
    main.appendChild(card);renderChain(card,cr);
  }
}

const observer=new MutationObserver(()=>enhance());observer.observe(main,{childList:true,subtree:true});enhance();
