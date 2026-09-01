export async function completeReceiving(supabase, payload) {
  const { data, error } = await supabase.rpc('complete_receiving', { payload });
  if (error) throw error;
  return data;
}
