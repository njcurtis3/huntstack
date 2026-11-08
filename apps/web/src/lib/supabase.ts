import { createClient, type AuthChangeEvent, type Session } from '@supabase/supabase-js'

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
  // Send the confirmation link back to the page the person signed up on, not to
  // Supabase's Site URL. Supabase only honors this if the origin is in its Redirect URLs list.
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  })
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.signInWithPassword({ email, password })
}

// Emails a reset link. The link signs the person in and fires PASSWORD_RECOVERY (authStore),
// which opens the "choose a new password" box. Like sign-up, the origin must be in Supabase's
// Redirect URLs list.
export async function sendPasswordReset(email: string) {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' })
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.updateUser({ password })
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
export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } }
  return supabase.auth.onAuthStateChange(callback)
}
