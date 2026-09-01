import { supabase } from './supabase-client.js';

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithEmail(email) {
  const clean = String(email || '').trim();
  if (!clean) throw new Error('Email is required');
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { emailRedirectTo: window.location.href.split('#')[0] }
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function ensureWorkspace(name = 'NODARA Workspace') {
  const { data, error } = await supabase.rpc('bootstrap_workspace', { p_name: name });
  if (error) throw error;
  return data;
}
