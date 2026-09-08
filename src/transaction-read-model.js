import { supabase } from './supabase-client.js';

const TYPE_ALIASES={WR:'WAREHOUSE_RECEIPT',WAREHOUSE_RECEIPT:'WAREHOUSE_RECEIPT',CR:'CARGO_RELEASE',CARGO_RELEASE:'CARGO_RELEASE',SHIPMENT:'SHIPMENT',TRANSPORT:'TRANSPORT_ORDER',TO:'TRANSPORT_ORDER',TRANSPORT_ORDER:'TRANSPORT_ORDER'};
export const normalizeTransactionType=t=>TYPE_ALIASES[String(t||'').toUpperCase()]||String(t||'').toUpperCase();

export async function resolveRegistryTransaction(transactionType,domainRecordId){
  const type=normalizeTransactionType(transactionType);
  const{data,error}=await supabase.from('transactions').select('*').eq('transaction_type',type).eq('domain_record_id',domainRecordId).maybeSingle();
  if(error)throw error;
  return data||null;
}

export async function loadTransactionReadModelById(registryTransactionId){
  let{data,error}=await supabase.rpc('nodara_get_transaction_workspace',{p_transaction_id:registryTransactionId});
  if(error&&/does not exist|schema cache/i.test(error.message||''))({data,error}=await supabase.rpc('nodara_get_transaction_read_model',{p_transaction_id:registryTransactionId}));
  if(error)throw error;
  return data||null;
}

export async function loadTransactionReadModel(transactionType,domainRecordId){
  const tx=await resolveRegistryTransaction(transactionType,domainRecordId);
  if(!tx)return null;
  const model=await loadTransactionReadModelById(tx.id);
  if(model&&!model.transaction)model.transaction=tx;
  else if(model)model.registry_transaction=tx;
  return model;
}

export function transactionCargoSummary(model){
  const t=model?.cargo_totals||{};
  return {handlingQuantity:Number(t.handling_units||0),grossWeightKg:Number(t.gross_weight_kg||0),volumeCbm:Number(t.volume_cbm||0)};
}

export function primaryParty(model,roleCode){
  const role=String(roleCode||'').toUpperCase(),rows=model?.parties||[];
  return rows.find(x=>String(x.role_code||'').toUpperCase()===role&&x.is_primary)||rows.find(x=>String(x.role_code||'').toUpperCase()===role)||null;
}

export function referencesByType(model,referenceType){
  const type=String(referenceType||'').toUpperCase();
  return (model?.references||[]).filter(x=>String(x.reference_type||'').toUpperCase()===type);
}

export default {normalizeTransactionType,resolveRegistryTransaction,loadTransactionReadModelById,loadTransactionReadModel,transactionCargoSummary,primaryParty,referencesByType};
