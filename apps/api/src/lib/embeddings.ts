// Embeddings moved off Together.ai in Oct 2026: it retired e5-large-instruct from serverless,
// the third embedding model it has pulled (bge-base and m2-bert went first), and offered none
// in its place. OpenAI's text-embedding-3-small takes a `dimensions` parameter, so it fills the
// existing vector(1024) column with no migration. Vectors from different models are not
// comparable: every stored chunk has to be re-embedded with this model
// (apps/scrapers-python/.../scripts/cleanup/reembed_all.py).
//
// The endpoint is OpenAI-compatible and configurable, so the same call can go through
// OpenRouter: EMBEDDINGS_BASE_URL=https://openrouter.ai/api/v1,
// EMBEDDINGS_MODEL=openai/text-embedding-3-small, EMBEDDINGS_API_KEY=<OpenRouter key>.
// Chunks and queries must use the same model, so change it here and in the scrapers together.
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'text-embedding-3-small'
// Must match document_chunks.embedding vector(1024) and the scrapers' EMBEDDING_DIMENSIONS.
export const EMBEDDING_DIMENSIONS = 1024

function embeddingApiKey(): string | undefined {
  return process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || undefined
}

export function isEmbeddingConfigured(): boolean {
  return !!embeddingApiKey()
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = embeddingApiKey()
  if (!apiKey) {
    throw new Error('EMBEDDINGS_API_KEY (or OPENAI_API_KEY) environment variable is not set')
  }
  const baseUrl = (process.env.EMBEDDINGS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.EMBEDDINGS_MODEL || DEFAULT_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  })

  if (!response.ok) {
    // The body names the problem (bad key, quota, model access); the status alone does not.
    throw new Error(`Embeddings ${response.status}: ${await response.text()}`)
  }

  const body = (await response.json()) as { data: Array<{ embedding: number[] }> }
  const embedding = body.data[0]?.embedding
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embeddings returned ${embedding?.length ?? 0} dims, expected ${EMBEDDING_DIMENSIONS}`)
  }
  return embedding
}
