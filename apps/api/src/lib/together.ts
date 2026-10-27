// Chat completions through any OpenAI-compatible endpoint. The file keeps its name from when this
// was the Together SDK; Together defaults still apply when nothing is configured. To run through
// OpenRouter: LLM_BASE_URL=https://openrouter.ai/api/v1, LLM_MODEL=meta-llama/llama-3.3-70b-instruct,
// LLM_API_KEY=<OpenRouter key>. Llama 3.3 70B is non-reasoning, so the whole max_tokens budget goes
// to the answer (Together retired its Qwen2.5-7B serverless model ~Oct 2026).
const DEFAULT_BASE_URL = 'https://api.together.xyz/v1'
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'

function apiKey(): string | undefined {
  return process.env.LLM_API_KEY || process.env.TOGETHER_API_KEY || undefined
}

export function isConfigured(): boolean {
  return !!apiKey()
}

export async function generateChatResponse(
  userMessage: string,
  systemPrompt: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const key = apiKey()
  if (!key) {
    throw new Error('LLM_API_KEY (or TOGETHER_API_KEY) environment variable is not set')
  }
  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')

  const response = await fetch(`${baseUrl}/chat/completions`, {
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
      messages: [
        { role: 'system', content: systemPrompt },
        ...(history ?? []),
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    // The body names the problem (bad key, retired model, no credit); the status alone does not.
    throw new Error(`Chat completion ${response.status}: ${await response.text()}`)
  }

  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return body.choices?.[0]?.message?.content || ''
}
