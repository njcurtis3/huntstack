import Anthropic from '@anthropic-ai/sdk'
import { generateChatWithWebSearch, LlmHttpError, type WebCitation } from './together.js'

// Chat on a user's own AI key instead of HuntStack's. Claude (Anthropic API key) and OpenRouter
// keys search the web the same way HuntStack's own chat does, billed to the user's account;
// OpenAI keys answer from HuntStack's data without a web search.
//
// These are API keys, billed per use by the provider. A Claude Pro or ChatGPT Plus subscription
// is not an API key and cannot be connected; the Settings page says so.

export type Provider = 'anthropic' | 'openai' | 'openrouter'

export interface ProviderInfo {
  id: Provider
  label: string
  defaultModel: string
  /** Fixed choices; null = free text */
  models: Array<{ id: string; label: string }> | null
  webSearch: boolean
  keyPrefix: string
  keyUrl: string
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic API key)',
    defaultModel: 'claude-opus-5-5',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (best answers)' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
    ],
    webSearch: true,
    keyPrefix: 'sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI API key',
    defaultModel: 'gpt-5-mini',
    models: null,
    webSearch: false,
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    models: null,
    webSearch: true,
    keyPrefix: 'sk-or-',
    keyUrl: 'https://openrouter.ai/settings/keys',
  },
}

export function isProvider(v: unknown): v is Provider {
  return v === 'anthropic' || v === 'openai' || v === 'openrouter'
}

const MODEL_RE = /^[A-Za-z0-9._:/-]{1,100}$/

/** The model to store, or an error message. */
export function checkModel(provider: Provider, model: string | undefined): { ok: true; model: string } | { ok: false; message: string } {
  const info = PROVIDERS[provider]
  const m = (model ?? '').trim() || info.defaultModel
  if (info.models) {
    return info.models.some(x => x.id === m) ? { ok: true, model: m } : { ok: false, message: 'Choose one of the listed models' }
  }
  return MODEL_RE.test(m) ? { ok: true, model: m } : { ok: false, message: 'That model name has characters a model id never has' }
}

/** A failure the user can fix (bad key, no credit, unknown model). The message is shown as is. */
export class UserKeyError extends Error {}

const OPENAI_BASE = 'https://api.openai.com/v1'
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

function friendly(provider: Provider, status: number, detail = ''): UserKeyError {
  const name = provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : 'OpenRouter'
  if (status === 401 || status === 403) return new UserKeyError(`${name} rejected your key. Check it in Settings.`)
  if (status === 402 || /credit|billing|quota|insufficient/i.test(detail)) {
    return new UserKeyError(`Your ${name} account is out of credit. Add credit with ${name}, or remove your key in Settings to use HuntStack's.`)
  }
  if (status === 404) return new UserKeyError(`${name} doesn't offer the model chosen in Settings. Pick another.`)
  if (status === 429) return new UserKeyError(`Your ${name} account hit its rate limit. Try again in a minute.`)
  return new UserKeyError(`${name} couldn't answer (error ${status}). Try again in a minute.`)
}

/** Ask the provider whether the key works, without spending anything. */
export async function verifyKey(provider: Provider, apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (provider === 'anthropic') {
      await new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 })
      return { ok: true }
    }
    const url = provider === 'openai' ? `${OPENAI_BASE}/models` : `${OPENROUTER_BASE}/key`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) })
    if (res.ok) return { ok: true }
    return { ok: false, message: friendly(provider, res.status).message }
  } catch (err) {
    if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
      return { ok: false, message: friendly(provider, err.status, err.message).message }
    }
    return { ok: false, message: 'Could not reach the provider to check the key. Try again.' }
  }
}

/** Turn an OpenRouter sign-in code (PKCE) into an API key for this user. */
export async function exchangeOpenRouterCode(code: string, codeVerifier: string): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: 'S256' }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new UserKeyError('OpenRouter did not accept the sign-in. Try connecting again.')
  const body = (await res.json()) as { key?: string }
  if (!body.key) throw new UserKeyError('OpenRouter did not return a key. Try connecting again.')
  return body.key
}

type History = Array<{ role: 'user' | 'assistant'; content: string }>

export interface UserChatArgs {
  userMessage: string
  systemPrompt: string
  history: History | undefined
  searchPrompt: string
}

export interface UserChatResult {
  text: string
  citations: WebCitation[]
  webSearched: boolean
}

export async function chatWithUserKey(
  key: { provider: Provider; apiKey: string; model: string },
  args: UserChatArgs,
): Promise<UserChatResult> {
  if (key.provider === 'anthropic') return chatClaude(key.apiKey, key.model, args)
  if (key.provider === 'openrouter') {
    try {
      return await generateChatWithWebSearch(args.userMessage, args.systemPrompt, args.history, args.searchPrompt, {
        apiKey: key.apiKey,
        baseUrl: OPENROUTER_BASE,
        model: key.model,
      })
    } catch (err) {
      if (err instanceof LlmHttpError) throw friendly('openrouter', err.status, err.message)
      throw err
    }
  }
  return chatOpenAI(key.apiKey, key.model, args)
}

// Opus 5.5 and Sonnet 5.5 take server-side refusal fallbacks; Haiku 5.5 does not.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5'])

async function chatClaude(apiKey: string, model: string, args: UserChatArgs): Promise<UserChatResult> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 55_000 })
  // The Messages API wants the conversation to start with the user
  const history = [...(args.history ?? [])]
  while (history.length && history[0].role !== 'user') history.shift()
  let messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: 'user', content: args.userMessage }]
  const webTool = model === 'claude-haiku-5-5'
    ? { type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 3 }
    : { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 3 }

  try {
    // A long web search can pause the turn; send it back to let Claude finish (at most twice)
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        system: args.systemPrompt,
        messages,
        tools: [webTool],
        // Chat answers read numbers from the context; low effort keeps them quick and cheap
        output_config: { effort: 'low' },
        ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      })

      if (response.stop_reason === 'pause_turn') {
        messages = [...messages, { role: 'assistant', content: response.content }]
        continue
      }
      if (response.stop_reason === 'refusal') {
        return { text: "Claude declined to answer this question. Try asking it a different way.", citations: [], webSearched: false }
      }

      let text = ''
      const citations: WebCitation[] = []
      const seen = new Set<string>()
      let webSearched = false
      for (const block of response.content) {
        if (block.type === 'server_tool_use') webSearched = true
        if (block.type !== 'text') continue
        text += block.text
        for (const c of block.citations ?? []) {
          if (c.type !== 'web_search_result_location' || seen.has(c.url)) continue
          seen.add(c.url)
          citations.push({
            title: c.title?.trim() || c.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
            url: c.url,
            snippet: c.cited_text.length > 200 ? `${c.cited_text.slice(0, 200)}...` : c.cited_text,
          })
        }
      }
      return { text, citations, webSearched }
    }
    throw new UserKeyError('Claude took too long searching the web. Try again.')
  } catch (err) {
    if (err instanceof Anthropic.APIError && typeof err.status === 'number') throw friendly('anthropic', err.status, err.message)
    throw err
  }
}

async function chatOpenAI(apiKey: string, model: string, args: UserChatArgs): Promise<UserChatResult> {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      // Newer OpenAI models reject a temperature and count reasoning against this cap
      max_completion_tokens: 8000,
      messages: [
        { role: 'system', content: args.systemPrompt },
        ...(args.history ?? []),
        { role: 'user', content: args.userMessage },
      ],
    }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) throw friendly('openai', res.status, await res.text())
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return { text: body.choices?.[0]?.message?.content || '', citations: [], webSearched: false }
}
