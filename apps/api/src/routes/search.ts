import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ilike, or, eq, and, sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { isConfigured, generateEmbedding } from '../lib/together.js'
import { regulations, species, states, locations } from '@huntstack/db/schema'

const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['all', 'regulations', 'species', 'locations']).optional(),
  state: z.string().length(2).optional(),
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
          type: { type: 'string', enum: ['all', 'regulations', 'species', 'locations'] },
          state: { type: 'string', description: 'Filter by state code (e.g., TX)' },
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
    const db = getDb()
    const pattern = `%${query.q}%`

    const results: Array<{ type: string; id: string; title: string; snippet: string; stateCode?: string; category?: string }> = []

    const searchType = query.type || 'all'

    // Search species
    if (searchType === 'all' || searchType === 'species') {
      const speciesResults = await db
        .select({
          id: species.id,
          slug: species.slug,
          name: species.name,
          category: species.category,
          description: species.description,
        })
        .from(species)
        .where(or(
          ilike(species.name, pattern),
          ilike(species.description, pattern),
          ilike(species.habitat, pattern),
        ))
        .limit(query.limit)

      for (const s of speciesResults) {
        results.push({
          type: 'species',
          id: s.slug,
          title: s.name,
          snippet: s.description?.slice(0, 200) || '',
          category: s.category,
        })
      }
    }

    // Search regulations
    if (searchType === 'all' || searchType === 'regulations') {
      const regConditions = [
        eq(regulations.isActive, true),
        or(
          ilike(regulations.title, pattern),
          ilike(regulations.content, pattern),
          ilike(regulations.summary, pattern),
        ),
      ]

      // State filter
      if (query.state) {
        const stateRows = await db.select({ id: states.id }).from(states).where(eq(states.code, query.state.toUpperCase()))
        if (stateRows.length > 0) {
          regConditions.push(eq(regulations.stateId, stateRows[0].id))
        }
      }

      const regResults = await db
        .select({
          id: regulations.id,
          title: regulations.title,
          summary: regulations.summary,
          content: regulations.content,
          category: regulations.category,
          stateCode: states.code,
        })
        .from(regulations)
        .innerJoin(states, eq(regulations.stateId, states.id))
        .where(and(...regConditions))
        .limit(query.limit)

      for (const r of regResults) {
        results.push({
          type: 'regulation',
          id: r.id,
          title: r.title,
          snippet: (r.summary || r.content)?.slice(0, 200) || '',
          stateCode: r.stateCode,
          category: r.category,
        })
      }
    }

    // Search locations
    if (searchType === 'all' || searchType === 'locations') {
      const locConditions = [
        or(
          ilike(locations.name, pattern),
          ilike(locations.description, pattern),
        ),
      ]

      if (query.state) {
        const stateRows = await db.select({ id: states.id }).from(states).where(eq(states.code, query.state.toUpperCase()))
        if (stateRows.length > 0) {
          locConditions.push(eq(locations.stateId, stateRows[0].id))
        }
      }

      const locResults = await db
        .select({
          id: locations.id,
          name: locations.name,
          locationType: locations.locationType,
          description: locations.description,
          stateCode: states.code,
        })
        .from(locations)
        .innerJoin(states, eq(locations.stateId, states.id))
        .where(and(...locConditions))
        .limit(query.limit)

      for (const l of locResults) {
        results.push({
          type: 'location',
          id: l.id,
          title: l.name,
          snippet: l.description?.slice(0, 200) || '',
          stateCode: l.stateCode,
          category: l.locationType,
        })
      }
    }

    return {
      results: results.slice(query.offset, query.offset + query.limit),
      total: results.length,
      query: query.q,
    }
  })

  // Semantic search using vector embeddings (Together.ai + pgvector)
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
  }, async (request, reply) => {
    const { query, limit = 10 } = request.body as { query: string; limit?: number }

    if (!isConfigured()) {
      return reply.status(503).send({
        error: true,
        message: 'AI service not configured. Please set TOGETHER_API_KEY.',
      })
    }

    try {
      const queryEmbedding = await generateEmbedding(query)
      const db = getDb()

      const results = await db.execute(sql`
        SELECT
          dc.content,
          d.title,
          d.source_url,
          d.document_type,
          d.metadata AS doc_metadata,
          1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${limit}
      `)

      const rows = results as unknown as Array<{
        content: string
        title: string
        source_url: string | null
        document_type: string
        doc_metadata: Record<string, unknown> | null
        similarity: number
      }>

      return {
        results: rows.filter(r => r.similarity > 0.3).map(r => ({
          content: r.content,
          title: r.title,
          sourceUrl: r.source_url,
          documentType: r.document_type,
          similarity: r.similarity,
          metadata: r.doc_metadata,
        })),
        query,
      }
    } catch (error) {
      app.log.error(error)
      return {
        results: [],
        query,
      }
    }
  })
}
