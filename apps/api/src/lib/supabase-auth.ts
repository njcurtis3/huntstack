import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Verifies a Supabase access token by asking Supabase who it belongs to (auth.getUser(token)).
// No JWT secret is held here and no @fastify/jwt is registered.

export class AuthUnconfiguredError extends Error {
  constructor() {
    super('SUPABASE_URL and SUPABASE_ANON_KEY are not set')
  }
}

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_ANON_KEY
    if (!url || !key) throw new AuthUnconfiguredError()
    _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return _client
}

/** The user id the token belongs to, or null when the token is invalid or expired. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  const { data, error } = await getClient().auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
