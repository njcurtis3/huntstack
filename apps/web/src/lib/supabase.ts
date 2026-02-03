import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Auth features will be disabled.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Auth helpers
export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.signUp({ email, password })
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.signOut()
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getUser() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user
}

// Subscribe to auth changes
export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } }
  return supabase.auth.onAuthStateChange(callback)
}
