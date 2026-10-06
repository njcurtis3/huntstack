// Embeddings moved off Together.ai in Oct 2026: it retired e5-large-instruct from serverless,
// the third embedding model it has pulled (bge-base and m2-bert went first), and offered none
// in its place. OpenAI's text-embedding-3-small takes a `dimensions` parameter, so it fills the
// existing vector(1024) column with no migration. Vectors from different models are not
// comparable: every stored chunk has to be re-embedded with this model
// (apps/scrapers-python/.../scripts/cleanup/reembed_all.py).
const EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'
const EMBEDDING_MODEL = 'text-embedding-3-small'
// Must match document_chunks.embedding vector(1024) and the scrapers' EMBEDDING_DIMENSIONS.
export const EMBEDDING_DIMENSIONS = 1024

export function isEmbeddingConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  const response = await fetch(EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  })

  if (!response.ok) {
    // The body names the problem (bad key, quota, model access); the status alone does not.
    throw new Error(`OpenAI embeddings ${response.status}: ${await response.text()}`)
  }

  const body = (await response.json()) as { data: Array<{ embedding: number[] }> }
  const embedding = body.data[0]?.embedding
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`OpenAI embeddings returned ${embedding?.length ?? 0} dims, expected ${EMBEDDING_DIMENSIONS}`)
  }
  return embedding
}
