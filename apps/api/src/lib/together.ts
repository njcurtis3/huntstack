import Together from 'together-ai'

const EMBEDDING_MODEL = 'intfloat/multilingual-e5-large-instruct'
// Qwen2.5-7B-Instruct-Turbo left Together's serverless tier ~Oct 2026 (400 model_not_available).
// Llama 3.3 70B is serverless and non-reasoning, so the whole max_tokens budget goes to the answer.
const CHAT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'

let _client: Together | null = null

function getClient(): Together {
  if (!_client) {
    const apiKey = process.env.TOGETHER_API_KEY
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY environment variable is not set')
    }
    _client = new Together({ apiKey })
  }
  return _client
}

export function isConfigured(): boolean {
  return !!process.env.TOGETHER_API_KEY
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient()
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  return response.data[0].embedding
}

export async function generateChatResponse(
  userMessage: string,
  systemPrompt: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const client = getClient()
  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      ...(history ?? []),
      { role: 'user', content: userMessage },
    ],
  })
  return response.choices[0]?.message?.content || ''
}
