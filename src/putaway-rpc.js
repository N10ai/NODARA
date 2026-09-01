export async function putawayCargo(supabase, cargoUnitId, locationCode) {
  if (!supabase) throw new Error('Supabase client is required');
  if (!cargoUnitId) throw new Error('Cargo unit is required');
  if (!locationCode) throw new Error('Location code is required');

  const { data, error } = await supabase.rpc('putaway_cargo', {
    p_cargo_unit_id: cargoUnitId,
    p_location_code: locationCode.trim()
  });

  if (error) throw error;
  return data;
}
