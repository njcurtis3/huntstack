import Together from 'together-ai'

const EMBEDDING_MODEL = 'BAAI/bge-base-en-v1.5'
const CHAT_MODEL = 'meta-llama/Llama-3-8b-chat-hf'

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
): Promise<string> {
  const client = getClient()
  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  })
  return response.choices[0]?.message?.content || ''
}
