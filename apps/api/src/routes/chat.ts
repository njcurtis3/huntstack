import { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // Chat completion with RAG
  app.post('/', {
    schema: {
      tags: ['chat'],
      summary: 'Ask a question with AI-powered RAG response',
      body: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'User question' },
          conversationId: { type: 'string', description: 'Optional conversation ID for context' },
        },
        required: ['message'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            response: { type: 'string' },
            sources: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                  snippet: { type: 'string' },
                },
              },
            },
            conversationId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { message, conversationId } = request.body as { 
      message: string
      conversationId?: string 
    }

    if (!anthropic) {
      return reply.status(503).send({
        error: true,
        message: 'AI service not configured. Please set ANTHROPIC_API_KEY.',
      })
    }

    try {
      // Step 1: Retrieve relevant context using semantic search
      const context = await retrieveContext(message)

      // Step 2: Generate response using Claude
      const systemPrompt = buildSystemPrompt(context)
      
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: message }
        ],
      })

      // Extract text from response
      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')

      return {
        response: responseText,
        sources: context.sources,
        conversationId: conversationId || generateConversationId(),
      }
    } catch (error) {
      app.log.error(error)
      return reply.status(500).send({
        error: true,
        message: 'Failed to generate response',
      })
    }
  })

  // Get conversation history
  app.get('/history/:conversationId', {
    schema: {
      tags: ['chat'],
      summary: 'Get conversation history',
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
        },
        required: ['conversationId'],
      },
    },
  }, async (request) => {
    const { conversationId } = request.params as { conversationId: string }

    // TODO: Fetch from database/Redis
    return {
      conversationId,
      messages: [],
    }
  })
}

// Helper function to retrieve relevant context from the database
async function retrieveContext(query: string): Promise<{
  documents: Array<{ content: string; metadata: Record<string, unknown> }>
  sources: Array<{ title: string; url?: string; snippet: string }>
}> {
  // TODO: Implement actual retrieval
  // 1. Generate embedding for query using OpenAI
  // 2. Query pgvector for similar documents
  // 3. Return top-k results with metadata

  // Placeholder implementation
  return {
    documents: [],
    sources: [],
  }
}

// Build system prompt with retrieved context
function buildSystemPrompt(context: {
  documents: Array<{ content: string; metadata: Record<string, unknown> }>
  sources: Array<{ title: string; url?: string; snippet: string }>
}): string {
  const contextText = context.documents
    .map(doc => doc.content)
    .join('\n\n---\n\n')

  return `You are HuntStack AI, a helpful assistant specializing in hunting regulations, seasons, locations, and wildlife information across the United States.

Your role is to:
1. Answer questions about hunting regulations accurately
2. Provide information about seasons, bag limits, and license requirements
3. Help users find hunting locations and outfitters
4. Explain migratory bird patterns and flyway information
5. Always remind users to verify regulations with official state sources

Important guidelines:
- Be accurate and specific when citing regulations
- Always mention which state's regulations you're referencing
- If you're unsure about specific details, say so
- Encourage users to check official state wildlife agency websites
- Be helpful and conversational while remaining informative

${contextText ? `Here is relevant information from our database to help answer the user's question:

${contextText}

Use this information to provide an accurate response, but don't fabricate details not present in the context.` : 'Note: No specific context was retrieved for this query. Provide general guidance and encourage the user to search for specific state regulations.'}
`
}

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
