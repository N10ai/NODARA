import './cargo-loader-smart-search.js';
import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const metaOf=u=>({
  legacy_cargo_unit_id:u.id,
  part_number:u.part_number||null,
  sku:u.sku||null,
  serial_number:u.serial_number||null,
  lot_number:u.lot_number||null,
  inventory_quantity:u.metadata?.inventory_quantity??u.inventory_quantity??null,
  inventory_uom:u.metadata?.inventory_uom??u.uom??null,
  barcode:u.metadata?.barcode??u.barcode??null
});
const volume=u=>{
  const l=Number(u.length_in||0),w=Number(u.width_in||0),h=Number(u.height_in||0),q=Number(u.quantity||1);
  return l&&w&&h?(l*w*h*q)/61023.744:null;
};
async function resolveWR(input={}){
  if(input.warehouse_receipt_id||input.wr_id){const id=input.warehouse_receipt_id||input.wr_id;const{data}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number').eq('id',id).maybeSingle();return data}
  if(input.receipt_number){const{data}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number').eq('receipt_number',input.receipt_number).maybeSingle();return data}
  if(input.job_id){const{data}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number').eq('job_id',input.job_id).order('created_at',{ascending:false}).limit(1).maybeSingle();return data}
  return null;
}
export async function syncWarehouseReceiptCargo(input={}){
  const wr=await resolveWR(input);if(!wr?.id||!wr.job_id)return{created:0,existing:0};
  const org=await getCurrentOrganizationId();
  const{data:units,error}=await supabase.from('cargo_units').select('*').eq('job_id',wr.job_id).order('created_at');if(error)throw error;
  if(!units?.length)return{created:0,existing:0};
  const{data:existing,error:ee}=await supabase.from('cargo_objects').select('id,parent_cargo_id,metadata').eq('organization_id',org).eq('source_type','WAREHOUSE_RECEIPT').eq('source_id',wr.id);if(ee)throw ee;
  const byLegacy=new Map((existing||[]).map(x=>[x.metadata?.legacy_cargo_unit_id,x]));let created=0;
  const idMap=new Map();for(const u of units){const old=byLegacy.get(u.id);if(old)idMap.set(u.id,old.id)}
  const pending=[...units];let guard=0;
  while(pending.length&&guard++<units.length+3){let progressed=false;for(let i=pending.length-1;i>=0;i--){const u=pending[i];if(u.parent_id&&!idMap.has(u.parent_id))continue;if(idMap.has(u.id)){pending.splice(i,1);progressed=true;continue}
    const payload={organization_id:org,source_type:'WAREHOUSE_RECEIPT',source_id:wr.id,parent_cargo_id:u.parent_id?idMap.get(u.parent_id):null,cargo_code:u.uin||u.handling_unit_code||null,package_type:u.package_type||'PIECE',quantity:Number(u.quantity||1),uom:u.uom||'EA',description:u.description||null,gross_weight:u.weight_lb==null?null:Number(u.weight_lb),weight_unit:'LB',length:u.length_in==null?null:Number(u.length_in),width:u.width_in==null?null:Number(u.width_in),height:u.height_in==null?null:Number(u.height_in),dimension_unit:'IN',volume_cbm:volume(u),warehouse_location_id:u.warehouse_location_id||null,status:String(u.status||'AVAILABLE').toUpperCase()==='RELEASED'?'RELEASED':'AVAILABLE',metadata:metaOf(u)};
    const{data,error:ce}=await supabase.from('cargo_objects').insert(payload).select('id').single();if(ce)throw ce;idMap.set(u.id,data.id);created++;pending.splice(i,1);progressed=true;
  }if(!progressed)break}
  window.dispatchEvent(new CustomEvent('nodara:wr-cargo-synced',{detail:{warehouse_receipt_id:wr.id,created}}));return{created,existing:(existing||[]).length};
}
window.nodaraSyncWRCargo=syncWarehouseReceiptCargo;
