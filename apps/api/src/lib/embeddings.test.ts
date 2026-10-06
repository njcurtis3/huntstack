import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMBEDDING_DIMENSIONS, generateEmbedding, isEmbeddingConfigured } from './embeddings.js'

const vector = (n: number) => Array.from({ length: n }, (_, i) => i / n)

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

describe('embeddings', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is configured only when OPENAI_API_KEY is set', () => {
    expect(isEmbeddingConfigured()).toBe(true)
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(isEmbeddingConfigured()).toBe(false)
  })

  it('asks for vectors the size of the document_chunks column', async () => {
    const fetchMock = mockFetch(200, { data: [{ embedding: vector(EMBEDDING_DIMENSIONS) }] })

    const result = await generateEmbedding('snow geese near Amarillo')

    expect(result).toHaveLength(1024)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/embeddings')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    expect(JSON.parse(init.body)).toEqual({
      model: 'text-embedding-3-small',
      input: 'snow geese near Amarillo',
      dimensions: 1024,
    })
  })

  it('throws without calling out when the key is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const fetchMock = mockFetch(200, {})

    await expect(generateEmbedding('x')).rejects.toThrow('OPENAI_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the error body on a failed request', async () => {
    mockFetch(401, { error: { message: 'Incorrect API key provided' } })

    await expect(generateEmbedding('x')).rejects.toThrow(/401.*Incorrect API key/)
  })

  it('rejects a vector of the wrong size instead of writing it to pgvector', async () => {
    mockFetch(200, { data: [{ embedding: vector(1536) }] })

    await expect(generateEmbedding('x')).rejects.toThrow('returned 1536 dims, expected 1024')
  })
})
