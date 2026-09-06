import './cargo-loader-smart-search.js';
import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const metaOf=u=>({
  ...(u.metadata||{}),
  legacy_cargo_unit_id:u.id,
  part_number:u.part_number||null,
  sku:u.sku||null,
  serial_number:u.serial_number||null,
  lot_number:u.lot_number||null,
  inventory_quantity:u.metadata?.inventory_quantity??u.inventory_quantity??null,
  inventory_uom:u.metadata?.inventory_uom??u.uom??null,
  barcode:u.metadata?.barcode??u.barcode??null
});
const volume=u=>{const l=Number(u.length_in||0),w=Number(u.width_in||0),h=Number(u.height_in||0),q=Number(u.quantity||1);return l&&w&&h?(l*w*h*q)/61023.744:null};
async function resolveWR(input={}){
  if(input.warehouse_receipt_id||input.wr_id){const id=input.warehouse_receipt_id||input.wr_id;const{data}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number').eq('id',id).maybeSingle();return data}
  if(input.receipt_number){const{data}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number').eq('receipt_number',input.receipt_number).maybeSingle();return data}
  if(input.job_id){const{data}=await supabase.from('warehouse_receipts').select('id,job_id,receipt_number').eq('job_id',input.job_id).order('created_at',{ascending:false}).limit(1).maybeSingle();return data}
  return null;
}
export async function syncWarehouseReceiptCargo(input={}){
  const wr=await resolveWR(input);if(!wr?.id||!wr.job_id)return{created:0,updated:0};
  const org=await getCurrentOrganizationId();
  const{data:units,error}=await supabase.from('cargo_units').select('*').eq('job_id',wr.job_id).order('created_at');if(error)throw error;if(!units?.length)return{created:0,updated:0};
  let created=0,updated=0;
  for(const u of units){
    const payload={
      id:u.id,
      organization_id:org,
      source_type:'WAREHOUSE_RECEIPT',
      source_id:wr.id,
      parent_cargo_id:u.parent_id||null,
      cargo_code:u.uin||u.handling_unit_code||null,
      package_type:u.package_type||'PIECE',
      quantity:Number(u.quantity||1),
      uom:u.uom||null,
      description:u.description||null,
      gross_weight:u.weight_lb==null?null:Number(u.weight_lb),weight_unit:'LB',
      length:u.length_in==null?null:Number(u.length_in),width:u.width_in==null?null:Number(u.width_in),height:u.height_in==null?null:Number(u.height_in),dimension_unit:'IN',
      volume_cbm:volume(u),
      warehouse_location_id:u.parent_id?null:(u.warehouse_location_id||null),
      status:['RELEASED','SHIPPED','VOID','CANCELLED'].includes(String(u.status||'').toUpperCase())?String(u.status).toUpperCase():'AVAILABLE',
      metadata:metaOf(u),updated_at:new Date().toISOString()
    };
    const{data:exists}=await supabase.from('cargo_objects').select('id').eq('id',u.id).maybeSingle();
    const{error:ce}=exists?await supabase.from('cargo_objects').update(payload).eq('id',u.id):await supabase.from('cargo_objects').insert(payload);if(ce)throw ce;
    exists?updated++:created++;
    if('cargo_object_id' in u && u.cargo_object_id!==u.id)await supabase.from('cargo_units').update({cargo_object_id:u.id}).eq('id',u.id);
    await supabase.from('cargo_assignments').upsert({organization_id:org,cargo_object_id:u.id,transaction_type:'WAREHOUSE_RECEIPT',transaction_id:wr.id,assignment_role:'SOURCE',status:'ASSIGNED'},{onConflict:'cargo_object_id,transaction_type,transaction_id,assignment_role'});
  }
  window.dispatchEvent(new CustomEvent('nodara:wr-cargo-synced',{detail:{warehouse_receipt_id:wr.id,created,updated}}));
  return{created,updated};
}
window.nodaraSyncWRCargo=syncWarehouseReceiptCargo;
