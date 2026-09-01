export async function fetchInventorySnapshot(supabase, organizationId) {
  if (!supabase) throw new Error('Supabase client is required');
  if (!organizationId) throw new Error('Organization is required');

  const { data, error } = await supabase.rpc('inventory_snapshot', {
    p_organization_id: organizationId
  });

  if (error) throw error;
  return data || [];
}

export function findInventoryItem(snapshot, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return snapshot;
  return snapshot.filter(item =>
    String(item.item_key || '').toLowerCase().includes(q) ||
    String(item.description || '').toLowerCase().includes(q) ||
    (item.handling_units || []).some(unit => String(unit.uin || '').toLowerCase().includes(q))
  );
}
