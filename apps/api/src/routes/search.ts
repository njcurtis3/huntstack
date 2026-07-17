import { FastifyPluginAsync } from 'fastify'
import { ilike, or, eq, and, sql, count } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { isConfigured, generateEmbedding } from '../lib/together.js'
import { regulations, species, states, locations } from '@huntstack/db/schema'
import { searchQuerySchema } from '@huntstack/shared'

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
    let total = 0

    const searchType = query.type || 'all'
    // A single type gets the full offset/limit window straight from the DB
    // (accurate pagination). 'all' shows a capped preview per category —
    // paginating a merged, heterogeneous result set doesn't map cleanly to a
    // single offset, so 'all' always starts from the top of each category;
    // callers wanting to page deeper into one category should pass `type`.
    const dbLimit = query.limit
    const dbOffset = searchType === 'all' ? 0 : query.offset

    // Search species
    if (searchType === 'all' || searchType === 'species') {
      const speciesCondition = or(
        ilike(species.name, pattern),
        ilike(species.description, pattern),
        ilike(species.habitat, pattern),
      )

      const [speciesResults, [{ value: speciesCount }]] = await Promise.all([
        db
          .select({
            id: species.id,
            slug: species.slug,
            name: species.name,
            category: species.category,
            description: species.description,
          })
          .from(species)
          .where(speciesCondition)
          .limit(dbLimit)
          .offset(dbOffset),
        db.select({ value: count() }).from(species).where(speciesCondition),
      ])

      total += speciesCount
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

      const regWhere = and(...regConditions)
      const [regResults, [{ value: regCount }]] = await Promise.all([
        db
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
          .where(regWhere)
          .limit(dbLimit)
          .offset(dbOffset),
        db.select({ value: count() }).from(regulations).innerJoin(states, eq(regulations.stateId, states.id)).where(regWhere),
      ])

      total += regCount
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

      const locWhere = and(...locConditions)
      const [locResults, [{ value: locCount }]] = await Promise.all([
        db
          .select({
            id: locations.id,
            name: locations.name,
            locationType: locations.locationType,
            description: locations.description,
            stateCode: states.code,
          })
          .from(locations)
          .innerJoin(states, eq(locations.stateId, states.id))
          .where(locWhere)
          .limit(dbLimit)
          .offset(dbOffset),
        db.select({ value: count() }).from(locations).innerJoin(states, eq(locations.stateId, states.id)).where(locWhere),
      ])

      total += locCount
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
      results,
      total,
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
