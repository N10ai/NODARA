import { listInventoryItems,listEntityItems } from './wr-data-v2.js';

let catalog=[];
let loaded=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadCatalog(){
  const customer=document.querySelector('[data-party="customer"]')?.value;
  try{
    if(customer){
      const profiles=await listEntityItems(customer);
      if(profiles?.length){
        catalog=profiles.map(p=>({
          ...p.inventory_items,
          id:p.inventory_item_id,
          part_number:p.customer_part_number||p.inventory_items?.part_number||'',
          sku:p.customer_sku||p.inventory_items?.sku||'',
          description:p.description_override||p.inventory_items?.description||'',
          base_uom:p.base_uom_override||p.inventory_items?.base_uom||'EA',
          barcode:p.inventory_items?.metadata?.barcode||''
        }));
        loaded=true;
        return;
      }
    }
    catalog=await listInventoryItems();
    loaded=true;
  }catch(e){
    console.warn('Part Master lookup failed',e);
    catalog=[];
    loaded=true;
  }
}

function setValue(el,value){
  if(!el)return;
  el.value=value??'';
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}

function enhanceNode(node){
  const meta=node.querySelector('.cargo-product-meta');
  if(!meta||meta.querySelector('[data-part-master-picker]'))return;
  const part=meta.querySelector('input[id$="-part"]');
  const sku=meta.querySelector('input[id$="-sku"]');
  const barcode=meta.querySelector('input[id$="-barcode"]');
  const desc=node.querySelector('input[id$="-desc"]');
  if(!part||!sku)return;

  const field=document.createElement('div');
  field.className='field cargo-part-master-field';
  field.dataset.partMasterPicker='1';
  const current=catalog.find(x=>(x.part_number||'')===part.value&&(x.sku||'')===sku.value);
  field.innerHTML=`<label>Part Master</label><select><option value="">No saved part / manual entry</option>${catalog.map(x=>`<option value="${x.id}" ${current?.id===x.id?'selected':''}>${esc(x.part_number||x.sku||x.description||'Item')}${x.sku&&x.part_number?` · ${esc(x.sku)}`:''}${x.description?` · ${esc(x.description)}`:''}</option>`).join('')}</select><small>Select a saved item to associate this cargo with Part Master.</small>`;
  meta.prepend(field);
  field.querySelector('select').onchange=e=>{
    const item=catalog.find(x=>String(x.id)===e.target.value);
    if(!item)return;
    setValue(part,item.part_number||'');
    setValue(sku,item.sku||'');
    setValue(barcode,item.barcode||item.metadata?.barcode||'');
    if(desc&&!desc.value)setValue(desc,item.description||'');
    part.dataset.inventoryItemId=item.id;
    sku.dataset.inventoryItemId=item.id;
  };
}

async function enhance(){
  if(!document.querySelector('.wr-object-head #cargo .cargo-hierarchy-v3'))return;
  if(!loaded)await loadCatalog();
  document.querySelectorAll('#cargo .cargo-tree-node').forEach(enhanceNode);
}

window.addEventListener('nodara:cargo-hierarchy-rendered',()=>enhance());
window.addEventListener('nodara:new-wr-draft',()=>{loaded=false;catalog=[];setTimeout(enhance,120)});
document.addEventListener('change',e=>{
  if(!e.target.matches?.('[data-party="customer"]'))return;
  loaded=false;catalog=[];setTimeout(enhance,120);
});
setTimeout(enhance,600);
