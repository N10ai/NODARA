import { supabase } from './supabase-client.js';

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithPassword(email, password) {
  const clean = String(email || '').trim();
  if (!clean) throw new Error('Email is required');
  if (!password) throw new Error('Password is required');
  const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password });
  if (error) throw error;
  return data.session;
}

export async function signUpWithPassword(email, password) {
  const clean = String(email || '').trim();
  if (!clean) throw new Error('Email is required');
  if (!password || password.length < 8) throw new Error('Use at least 8 characters');
  const { data, error } = await supabase.auth.signUp({ email: clean, password });
  if (error) throw error;
  return data;
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
