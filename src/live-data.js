import { supabase } from './supabase-client.js';

export async function getInventorySnapshot() {
  const { data, error } = await supabase.rpc('inventory_snapshot');
  if (error) throw error;
  return data || [];
}

export async function findExpectedReceipts(search) {
  const q = String(search || '').trim();
  if (!q) return [];
  const { data: refs, error: refError } = await supabase.from('expected_receipt_references').select('expected_receipt_id,reference_type,reference_value').ilike('reference_value', `%${q}%`).limit(20);
  if (refError) throw refError;
  const ids = [...new Set((refs || []).map(r => r.expected_receipt_id))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('expected_receipts').select('*').in('id', ids).limit(20);
  if (error) throw error;
  return data || [];
}

export async function findInventory(search) {
  const q = String(search || '').trim().toLowerCase();
  const rows = await getInventorySnapshot();
  if (!q) return rows;
  return rows.filter(row => [row.item_key,row.part_number,row.sku,row.description].filter(Boolean).some(value => String(value).toLowerCase().includes(q)));
}

export async function listEntities(search = '') {
  let query = supabase.from('entities').select('id,name,code,roles').order('name').limit(50);
  if (String(search).trim()) query = query.ilike('name', `%${String(search).trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createWarehouseReceipt(input = {}) {
  const { data, error } = await supabase.rpc('create_warehouse_receipt', {
    p_reference: input.reference || null,
    p_customer_name: input.customer || null,
    p_description: input.description || null,
    p_package_type: input.packageType || 'PALLET',
    p_packages: Number(input.packages || 1),
    p_cartons: Number(input.cartons || 0),
    p_units: Number(input.units || 0),
    p_sku: input.sku || null,
    p_condition: input.condition || 'good'
  });
  if (error) throw error;
  return data;
}
