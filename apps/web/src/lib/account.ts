import { getSession } from './supabase'

// The signed-in user's settings (/api/account) and the chat request, which sends the sign-in
// token when there is one so the question counts against the right allowance. The token is read
// at call time and never stored.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export type Plan = 'visitor' | 'free' | 'pro' | 'own_key' | 'admin'
export type Provider = 'anthropic' | 'openai' | 'openrouter'

export interface ChatUsage {
  plan: Plan
  used: number
  limit: number | null
  resetsAt: string | null
}

export interface ProviderInfo {
  id: Provider
  label: string
  defaultModel: string
  models: Array<{ id: string; label: string }> | null
  webSearch: boolean
  keyPrefix: string
  keyUrl: string
}

export interface AiKeyInfo {
  provider: Provider
  model: string
  last4: string
  updatedAt: string
}

export interface Account {
  email: string | null
  usage: ChatUsage
  subscription: { status: string; active: boolean; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null
  aiKey: AiKeyInfo | null
  billingAvailable: boolean
  ownKeysAvailable: boolean
  providers: ProviderInfo[]
}

export class AccountError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly usage?: ChatUsage) {
    super(message)
  }
}

async function readError(response: Response): Promise<AccountError> {
  let message = ''
  let code: string | undefined
  let usage: ChatUsage | undefined
  try {
    const data = (await response.json()) as { message?: unknown; code?: unknown; usage?: ChatUsage }
    if (typeof data.message === 'string') message = data.message
    if (typeof data.code === 'string') code = data.code
    usage = data.usage
  } catch {
    // not JSON
  }
  return new AccountError(response.status, message || 'Something went wrong. Please try again.', code, usage)
}

async function authed<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const session = await getSession()
  if (!session?.access_token) throw new AccountError(401, 'Sign in to continue')
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${session.access_token}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new AccountError(0, 'Could not reach HuntStack. Check your connection and try again.')
  }
  if (!response.ok) throw await readError(response)
  return (await response.json()) as T
}

export const getAccount = () => authed<Account>('/api/account')

export const saveAiKey = (provider: Provider, apiKey: string | null, model: string) =>
  authed<{ aiKey: AiKeyInfo }>('/api/account/ai-key', {
    method: 'PUT',
    body: { provider, model, ...(apiKey ? { apiKey } : {}) },
  })

export const removeAiKey = () => authed<{ aiKey: null }>('/api/account/ai-key', { method: 'DELETE' })

export const startCheckout = () => authed<{ url: string }>('/api/account/billing/checkout', { method: 'POST' })

export const openBillingPortal = () => authed<{ url: string }>('/api/account/billing/portal', { method: 'POST' })

// ─── Connect OpenRouter (OAuth with PKCE) ───
// OpenRouter shows its own sign-in and returns ?code= to /settings; the code is only good with
// the verifier kept in this tab, so it is exchanged for a key by the API and never shown.

const VERIFIER_KEY = 'huntstack-openrouter-verifier'

function base64url(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function beginOpenRouterConnect(): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier)
  } catch {
    throw new AccountError(0, 'Your browser blocked the storage this needs. Paste an OpenRouter key instead.')
  }
  const callback = `${window.location.origin}/settings`
  window.location.assign(
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256`,
  )
}

/** Finish the OpenRouter sign-in, if this page load is its return. */
export async function finishOpenRouterConnect(code: string, model: string): Promise<{ aiKey: AiKeyInfo }> {
  let verifier: string | null = null
  try {
    verifier = sessionStorage.getItem(VERIFIER_KEY)
    sessionStorage.removeItem(VERIFIER_KEY)
  } catch {
    // fall through
  }
  if (!verifier) throw new AccountError(400, 'That OpenRouter sign-in expired. Connect again.')
  return authed<{ aiKey: AiKeyInfo }>('/api/account/ai-key/openrouter', {
    method: 'POST',
    body: { code, codeVerifier: verifier, model },
  })
}

// ─── Chat ───

export interface ChatResponse {
  response: string
  sources: Array<{ title: string; url?: string; snippet: string; kind?: 'web' | 'database' }>
  conversationId: string
  dataFreshnessNote?: string | null
  usage?: ChatUsage
}

/**
 * Ask the AI. Throws AccountError with code 'chat_limit' (status 402) when the free questions
 * are used up, and 'own_key_failed' when the user's own provider refused.
 */
export async function sendChat(
  message: string,
  conversationId?: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<ChatResponse> {
  const session = await getSession().catch(() => null)
  const controller = new AbortController()
  // Retrieval plus the model can take a while, more with a web search on a user's own key
  const timer = setTimeout(() => controller.abort(), 75_000)
  let response: Response
  try {
    response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ message, conversationId, history }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AccountError(0, 'Request timed out. Please check your connection and try again.')
    }
    throw new AccountError(0, 'Could not reach HuntStack. Check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw await readError(response)
  return (await response.json()) as ChatResponse
}

/** "3 of 10 free questions used this month", or null when there is no cap */
export function usageLine(usage: ChatUsage | undefined | null): string | null {
  if (!usage || usage.limit === null) return null
  const left = Math.max(0, usage.limit - usage.used)
  return usage.plan === 'visitor'
    ? `${left} of ${usage.limit} free questions left. Sign up free for ${10} a month.`
    : `${left} of ${usage.limit} free questions left this month.`
}
