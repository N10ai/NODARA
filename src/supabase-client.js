import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

if (!window.supabase?.createClient) {
  throw new Error('Supabase browser library did not load');
}

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const nativeRpc = client.rpc.bind(client);
client.rpc = async (fn, args, options) => {
  const result = await nativeRpc(fn, args, options);
  if (fn === 'bootstrap_workspace' && !result.error && result.data && typeof result.data === 'object') {
    const id = result.data.organization_id || result.data.organizationId || result.data.id;
    if (id) return { ...result, data: id };
  }
  return result;
};

export const supabase = client;
