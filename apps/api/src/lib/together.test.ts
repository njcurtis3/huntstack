import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateChatResponse, isConfigured } from './together.js'

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
