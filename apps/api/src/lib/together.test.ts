import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateChatResponse,
  generateChatWithWebSearch,
  isConfigured,
  isWebSearchEnabled,
  webCitations,
} from './together.js'

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('chat completions', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', '')
    vi.stubEnv('TOGETHER_API_KEY', 'tg-test')
    vi.stubEnv('LLM_BASE_URL', '')
    vi.stubEnv('LLM_MODEL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is configured by LLM_API_KEY or the legacy TOGETHER_API_KEY', () => {
    expect(isConfigured()).toBe(true)
    vi.stubEnv('TOGETHER_API_KEY', '')
    expect(isConfigured()).toBe(false)
    vi.stubEnv('LLM_API_KEY', 'or-test')
    expect(isConfigured()).toBe(true)
  })

  it('defaults to Together', async () => {
    const fetchMock = mockFetch(200, { choices: [{ message: { content: 'hi' } }] })

    expect(await generateChatResponse('q', 'sys')).toBe('hi')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.together.xyz/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer tg-test')
    expect(JSON.parse(init.body).model).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo')
  })

  it('routes through LLM_BASE_URL / LLM_MODEL / LLM_API_KEY (OpenRouter) and sends history in order', async () => {
    vi.stubEnv('LLM_BASE_URL', 'https://openrouter.ai/api/v1/')
    vi.stubEnv('LLM_MODEL', 'meta-llama/llama-3.3-70b-instruct')
    vi.stubEnv('LLM_API_KEY', 'or-test')
    const fetchMock = mockFetch(200, { choices: [{ message: { content: 'ok' } }] })

    await generateChatResponse('now', 'sys', [{ role: 'user', content: 'before' }])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer or-test')
    const sent = JSON.parse(init.body)
    expect(sent.model).toBe('meta-llama/llama-3.3-70b-instruct')
    expect(sent.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'user'])
  })

  it('throws without calling out when no key is set', async () => {
    vi.stubEnv('TOGETHER_API_KEY', '')
    const fetchMock = mockFetch(200, {})

    await expect(generateChatResponse('q', 'sys')).rejects.toThrow('LLM_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the error body on a failed request', async () => {
    mockFetch(402, { error: { message: 'Insufficient credits' } })

    await expect(generateChatResponse('q', 'sys')).rejects.toThrow(/402.*Insufficient credits/)
  })
})

describe('chat with web search', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', 'or-test')
    vi.stubEnv('LLM_BASE_URL', 'https://openrouter.ai/api/v1')
    vi.stubEnv('LLM_MODEL', '')
    vi.stubEnv('CHAT_WEB_SEARCH', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is on for OpenRouter unless CHAT_WEB_SEARCH=off, and off elsewhere', () => {
    expect(isWebSearchEnabled()).toBe(true)
    vi.stubEnv('CHAT_WEB_SEARCH', 'off')
    expect(isWebSearchEnabled()).toBe(false)
    vi.stubEnv('CHAT_WEB_SEARCH', '')
    vi.stubEnv('LLM_BASE_URL', '')
    expect(isWebSearchEnabled()).toBe(false)
  })

  it('sends the web plugin and returns the pages it cited', async () => {
    const fetchMock = mockFetch(200, {
      choices: [{
        message: {
          content: 'See [ksoutdoors.gov](https://ksoutdoors.gov/ducks).',
          annotations: [
            { type: 'url_citation', url_citation: { url: 'https://ksoutdoors.gov/ducks', title: 'Ducks', content: 'Daily bag   6' } },
            { type: 'url_citation', url_citation: { url: 'https://ksoutdoors.gov/ducks', title: 'Ducks again' } },
          ],
        },
      }],
    })

    const result = await generateChatWithWebSearch('q', 'sys', undefined, 'RESULTS')

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.plugins).toEqual([{ id: 'web', engine: 'exa', max_results: 5, search_prompt: 'RESULTS' }])
    expect(result.webSearched).toBe(true)
    expect(result.citations).toEqual([{ title: 'Ducks', url: 'https://ksoutdoors.gov/ducks', snippet: 'Daily bag 6' }])
  })

  it('answers without the web when the search request fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'plugin not supported' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'plain' } }] }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await generateChatWithWebSearch('q', 'sys', undefined, 'RESULTS')

    expect(result).toEqual({ text: 'plain', citations: [], webSearched: false })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).plugins).toBeUndefined()
  })

  it('skips small-context OpenRouter providers, configurably, and sends no provider field elsewhere', async () => {
    let fetchMock = mockFetch(200, { choices: [{ message: { content: 'x' } }] })
    await generateChatResponse('q', 'sys')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).provider).toEqual({ ignore: ['novita', 'cloudflare'] })

    vi.stubEnv('OPENROUTER_IGNORE_PROVIDERS', '')
    fetchMock = mockFetch(200, { choices: [{ message: { content: 'x' } }] })
    await generateChatResponse('q', 'sys')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).provider).toBeUndefined()

    vi.stubEnv('OPENROUTER_IGNORE_PROVIDERS', 'novita')
    vi.stubEnv('LLM_BASE_URL', '')
    vi.stubEnv('TOGETHER_API_KEY', 'tg-test')
    fetchMock = mockFetch(200, { choices: [{ message: { content: 'x' } }] })
    await generateChatResponse('q', 'sys')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).provider).toBeUndefined()
  })

  it('does not search when web search is off', async () => {
    vi.stubEnv('CHAT_WEB_SEARCH', 'off')
    const fetchMock = mockFetch(200, { choices: [{ message: { content: 'x' } }] })

    await generateChatWithWebSearch('q', 'sys', undefined, 'RESULTS')

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).plugins).toBeUndefined()
  })
})

describe('webCitations', () => {
  it('skips non-citations and non-http links, and names untitled pages by domain', () => {
    expect(webCitations([
      { type: 'file' },
      { type: 'url_citation', url_citation: { url: 'javascript:alert(1)', title: 'bad' } },
      { type: 'url_citation', url_citation: { url: 'https://www.wlf.louisiana.gov/page/x' } },
    ])).toEqual([{ title: 'wlf.louisiana.gov', url: 'https://www.wlf.louisiana.gov/page/x', snippet: '' }])
  })
})
