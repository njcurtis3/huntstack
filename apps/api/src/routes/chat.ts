import { FastifyPluginAsync } from 'fastify'
import { isConfigured, generateEmbedding, generateChatResponse } from '../lib/together.js'
import { getDb } from '../lib/db.js'
import { sql } from 'drizzle-orm'

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

    if (!isConfigured()) {
      return reply.status(503).send({
        error: true,
        message: 'AI service not configured. Please set TOGETHER_API_KEY.',
      })
    }

    try {
      // Step 1: Retrieve relevant context using semantic search
      const context = await retrieveContext(message)

      // Step 2: Generate response using Together.ai (Llama 3 8B)
      const systemPrompt = buildSystemPrompt(context)
      const responseText = await generateChatResponse(message, systemPrompt)

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

// Retrieve relevant context from pgvector
async function retrieveContext(query: string): Promise<{
  documents: Array<{ content: string; metadata: Record<string, unknown> }>
  sources: Array<{ title: string; url?: string; snippet: string }>
}> {
  try {
    // Generate embedding for the user's query
    const queryEmbedding = await generateEmbedding(query)

    // Query pgvector for similar document chunks
    const db = getDb()
    const results = await db.execute(sql`
      SELECT
        dc.id,
        dc.content,
        dc.metadata AS chunk_metadata,
        d.title,
        d.source_url,
        d.document_type,
        d.metadata AS doc_metadata,
        1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 5
    `)

    const rows = results as unknown as Array<{
      id: string
      content: string
      chunk_metadata: Record<string, unknown> | null
      title: string
      source_url: string | null
      document_type: string
      doc_metadata: Record<string, unknown> | null
      similarity: number
    }>

    // Filter out low-similarity results
    const relevant = rows.filter(r => r.similarity > 0.3)

    return {
      documents: relevant.map(r => ({
        content: r.content,
        metadata: {
          title: r.title,
          sourceUrl: r.source_url,
          documentType: r.document_type,
          ...(r.doc_metadata || {}),
          ...(r.chunk_metadata || {}),
        },
      })),
      sources: relevant.map(r => ({
        title: r.title,
        url: r.source_url || undefined,
        snippet: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
      })),
    }
  } catch (error) {
    // If embeddings aren't set up yet, return empty context gracefully
    console.error('retrieveContext error:', error)
    return { documents: [], sources: [] }
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
- Answer ONLY using the provided context
- If the answer is not in the context, say "I don't have that information in my database. Please check the official state wildlife agency website."
- Be accurate and specific when citing regulations
- Always mention which state's regulations you're referencing
- Be helpful and conversational while remaining informative

${contextText ? `Here is relevant information from our database to help answer the user's question:

${contextText}

Use this information to provide an accurate response. Do not fabricate details not present in the context.` : 'Note: No specific context was retrieved for this query. Provide general guidance and encourage the user to search for specific state regulations.'}
`
}

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
