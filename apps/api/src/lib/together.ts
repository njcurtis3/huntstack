// Chat completions through any OpenAI-compatible endpoint. The file keeps its name from when this
// was the Together SDK; Together defaults still apply when nothing is configured. To run through
// OpenRouter: LLM_BASE_URL=https://openrouter.ai/api/v1, LLM_MODEL=meta-llama/llama-3.3-70b-instruct,
// LLM_API_KEY=<OpenRouter key>. Llama 3.3 70B is non-reasoning, so the whole max_tokens budget goes
// to the answer (Together retired its Qwen2.5-7B serverless model ~Oct 2026).
const DEFAULT_BASE_URL = 'https://api.together.xyz/v1'
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'

// Web results per question. OpenRouter's Exa search costs ~$0.007 per request for up to 10.
const WEB_RESULTS = 5

// OpenRouter providers to skip. Of those serving Llama 3.3 70B (Oct 2026), Novita allows 12,288
// tokens and Cloudflare 24,000; a broad question's database context plus web results can exceed
// that, and the request fails instead of moving to a provider with room. The rest allow 128k+.
// Override with OPENROUTER_IGNORE_PROVIDERS (comma-separated slugs; empty skips none).
function ignoredProviders(): string[] {
  const raw = process.env.OPENROUTER_IGNORE_PROVIDERS ?? 'novita,cloudflare'
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
type History = Array<{ role: 'user' | 'assistant'; content: string }>

export interface WebCitation {
  title: string
  url: string
  snippet: string
}

function apiKey(): string | undefined {
  return process.env.LLM_API_KEY || process.env.TOGETHER_API_KEY || undefined
}

function baseUrl(): string {
  return (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export function isConfigured(): boolean {
  return !!apiKey()
}

/** Web search runs through OpenRouter's web plugin, so it needs OpenRouter; CHAT_WEB_SEARCH=off turns it off. */
export function isWebSearchEnabled(): boolean {
  return baseUrl().includes('openrouter.ai') && process.env.CHAT_WEB_SEARCH !== 'off'
}

async function complete(messages: ChatMessage[], plugins?: unknown[]) {
  const key = apiKey()
  if (!key) {
    throw new Error('LLM_API_KEY (or TOGETHER_API_KEY) environment variable is not set')
  }

  const ignore = baseUrl().includes('openrouter.ai') ? ignoredProviders() : []
  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || DEFAULT_MODEL,
      max_tokens: 1024,
      // Low temperature: answers are mostly dates and bag limits read from the context, where a
      // creative paraphrase is a wrong number.
      temperature: 0.2,
      messages,
      ...(plugins ? { plugins } : {}),
      ...(ignore.length ? { provider: { ignore } } : {}),
    }),
  })

  if (!response.ok) {
    // The body names the problem (bad key, retired model, no credit); the status alone does not.
    throw new Error(`Chat completion ${response.status}: ${await response.text()}`)
  }

  return (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string
        annotations?: Array<{ type?: string; url_citation?: { url?: string; title?: string; content?: string } }>
      }
    }>
  }
}

function buildMessages(userMessage: string, systemPrompt: string, history?: History): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...(history ?? []),
    { role: 'user', content: userMessage },
  ]
}

export async function generateChatResponse(
  userMessage: string,
  systemPrompt: string,
  history?: History,
): Promise<string> {
  const body = await complete(buildMessages(userMessage, systemPrompt, history))
  return body.choices?.[0]?.message?.content || ''
}

/**
 * Like generateChatResponse, but OpenRouter first searches the web for the question and attaches
 * the results after the system prompt. Returns the pages it found. If the search request fails,
 * answers without it (webSearched: false) rather than failing the chat.
 */
export async function generateChatWithWebSearch(
  userMessage: string,
  systemPrompt: string,
  history: History | undefined,
  searchPrompt: string,
): Promise<{ text: string; citations: WebCitation[]; webSearched: boolean }> {
  const messages = buildMessages(userMessage, systemPrompt, history)
  if (isWebSearchEnabled()) {
    try {
      const body = await complete(messages, [
        { id: 'web', engine: 'exa', max_results: WEB_RESULTS, search_prompt: searchPrompt },
      ])
      const message = body.choices?.[0]?.message
      return { text: message?.content || '', citations: webCitations(message?.annotations), webSearched: true }
    } catch (error) {
      console.error('web search chat failed, answering without it:', error)
    }
  }
  const body = await complete(messages)
  return { text: body.choices?.[0]?.message?.content || '', citations: [], webSearched: false }
}

export function webCitations(
  annotations?: Array<{ type?: string; url_citation?: { url?: string; title?: string; content?: string } }>,
): WebCitation[] {
  const seen = new Set<string>()
  const out: WebCitation[] = []
  for (const a of annotations ?? []) {
    const c = a.url_citation
    if (a.type !== 'url_citation' || !c?.url || !/^https?:\/\//.test(c.url) || seen.has(c.url)) continue
    seen.add(c.url)
    const text = (c.content ?? '').replace(/\s+/g, ' ').trim()
    out.push({
      title: c.title?.trim() || c.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
      url: c.url,
      snippet: text.length > 200 ? `${text.slice(0, 200)}...` : text,
    })
  }
  return out
}
