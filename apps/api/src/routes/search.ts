import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['all', 'regulations', 'species', 'outfitters', 'locations']).optional(),
  state: z.string().length(2).optional(),
  species: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
})

export const searchRoutes: FastifyPluginAsync = async (app) => {
  // Full-text search
  app.get('/', {
    schema: {
      tags: ['search'],
      summary: 'Search across all hunting data',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          type: { type: 'string', enum: ['all', 'regulations', 'species', 'outfitters', 'locations'] },
          state: { type: 'string', description: 'Filter by state code (e.g., CO)' },
          species: { type: 'string', description: 'Filter by species' },
          limit: { type: 'number', default: 20 },
          offset: { type: 'number', default: 0 },
        },
        required: ['q'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            results: { type: 'array' },
            total: { type: 'number' },
            query: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    const query = searchQuerySchema.parse(request.query)
    
    // TODO: Implement actual search using PostgreSQL full-text + pgvector
    // For now, return placeholder
    return {
      results: [],
      total: 0,
      query: query.q,
      filters: {
        type: query.type,
        state: query.state,
        species: query.species,
      },
    }
  })

  // Semantic search using RAG
  app.post('/semantic', {
    schema: {
      tags: ['search'],
      summary: 'Semantic search using vector embeddings',
      body: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 },
        },
        required: ['query'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            results: { type: 'array' },
            query: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    const { query, limit = 10 } = request.body as { query: string; limit?: number }
    
    // TODO: Implement semantic search
    // 1. Generate embedding for query using OpenAI
    // 2. Query pgvector for similar documents
    // 3. Return ranked results
    
    return {
      results: [],
      query,
      limit,
    }
  })
}
