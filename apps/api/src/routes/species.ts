import { FastifyPluginAsync } from 'fastify'
import { eq, and, desc, sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { species, regulations, seasons, states, locations, refugeCounts } from '@huntstack/db/schema'

export const speciesRoutes: FastifyPluginAsync = async (app) => {
  // List all species
  app.get('/', {
    schema: {
      tags: ['species'],
      summary: 'List all huntable species',
      querystring: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['big-game', 'waterfowl', 'upland', 'small-game', 'migratory'],
            description: 'Filter by category'
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            species: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  slug: { type: 'string' },
                  name: { type: 'string' },
                  scientificName: { type: 'string' },
                  category: { type: 'string' },
                  description: { type: 'string' },
                  habitat: { type: 'string' },
                  isMigratory: { type: 'boolean' },
                  flyways: {},
                  imageUrl: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const { category } = request.query as { category?: string }

    const db = getDb()

    const rows = await db.select({
      id: species.id,
      slug: species.slug,
      name: species.name,
      scientificName: species.scientificName,
      category: species.category,
      description: species.description,
      habitat: species.habitat,
      isMigratory: species.isMigratory,
      flyways: species.flyways,
      imageUrl: species.imageUrl,
    }).from(species).where(category ? eq(species.category, category) : undefined)

    return { species: rows }
  })

  // Get species details by slug
  app.get('/:id', {
    schema: {
      tags: ['species'],
      summary: 'Get species details by slug',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const db = getDb()
    const rows = await db.select().from(species).where(eq(species.slug, id))

    if (rows.length === 0) {
      return reply.status(404).send({ error: true, message: `Species '${id}' not found` })
    }

    const sp = rows[0]

    // Get seasons for this species across all states
    const speciesSeasons = await db
      .select({
        id: seasons.id,
        name: seasons.name,
        seasonType: seasons.seasonType,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
        year: seasons.year,
        bagLimit: seasons.bagLimit,
        stateCode: states.code,
        stateName: states.name,
      })
      .from(seasons)
      .innerJoin(states, eq(seasons.stateId, states.id))
      .where(eq(seasons.speciesId, sp.id))

    return {
      species: sp,
      seasons: speciesSeasons,
    }
  })

  // Get species regulations across states
  app.get('/:id/regulations', {
    schema: {
      tags: ['species'],
      summary: 'Get regulations for a species across all states',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter to specific state code' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { state } = request.query as { state?: string }

    const db = getDb()

    // Resolve species slug to ID
    const speciesRows = await db.select({ id: species.id }).from(species).where(eq(species.slug, id))
    if (speciesRows.length === 0) {
      return reply.status(404).send({ error: true, message: `Species '${id}' not found` })
    }
    const speciesId = speciesRows[0].id

    const conditions = [eq(regulations.speciesId, speciesId), eq(regulations.isActive, true)]

    if (state) {
      const stateRows = await db.select({ id: states.id }).from(states).where(eq(states.code, state.toUpperCase()))
      if (stateRows.length > 0) {
        conditions.push(eq(regulations.stateId, stateRows[0].id))
      }
    }

    const regs = await db
      .select({
        id: regulations.id,
        category: regulations.category,
        title: regulations.title,
        content: regulations.content,
        summary: regulations.summary,
        seasonYear: regulations.seasonYear,
        sourceUrl: regulations.sourceUrl,
        metadata: regulations.metadata,
        stateCode: states.code,
        stateName: states.name,
      })
      .from(regulations)
      .innerJoin(states, eq(regulations.stateId, states.id))
      .where(and(...conditions))

    return {
      speciesSlug: id,
      regulations: regs,
    }
  })

  // Get migration data for migratory species
  app.get('/:id/migration', {
    schema: {
      tags: ['species'],
      summary: 'Get migration patterns for a species',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          flyway: {
            type: 'string',
            enum: ['pacific', 'central', 'mississippi', 'atlantic'],
            description: 'Filter by flyway'
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { flyway } = request.query as { flyway?: string }

    const db = getDb()
    const rows = await db.select().from(species).where(eq(species.slug, id))

    if (rows.length === 0) {
      return reply.status(404).send({ error: true, message: `Species '${id}' not found` })
    }

    const sp = rows[0]

    if (!sp.isMigratory) {
      return { speciesSlug: id, isMigratory: false, flyways: [], message: 'This species is not migratory.' }
    }

    const allFlyways = (sp.flyways as string[]) || []
    const filteredFlyways = flyway ? allFlyways.filter(f => f === flyway) : allFlyways

    // Current locations: latest refuge counts for this species
    const currentRows = await db
      .select({
        refugeName: locations.name,
        stateCode: states.code,
        count: refugeCounts.count,
        surveyDate: refugeCounts.surveyDate,
        surveyType: refugeCounts.surveyType,
        centerPoint: locations.centerPoint,
        locationMetadata: locations.metadata,
      })
      .from(refugeCounts)
      .innerJoin(locations, eq(refugeCounts.locationId, locations.id))
      .innerJoin(states, eq(locations.stateId, states.id))
      .where(and(
        eq(refugeCounts.speciesId, sp.id),
        sql`${locations.name} NOT LIKE '% - Statewide MWI'`,
      ))
      .orderBy(desc(refugeCounts.surveyDate))
      .limit(50)

    let currentLocations = currentRows.map(r => ({
      refugeName: r.refugeName,
      state: r.stateCode,
      count: r.count,
      surveyDate: r.surveyDate,
      surveyType: r.surveyType,
      centerPoint: r.centerPoint,
      flyway: (r.locationMetadata as Record<string, unknown> | null)?.flyway || null,
    }))

    if (flyway) {
      currentLocations = currentLocations.filter(r => r.flyway === flyway)
    }

    // Historical patterns: MWI annual data grouped by year and state
    const historicalRows = await db.execute(sql`
      SELECT
        EXTRACT(YEAR FROM rc.survey_date)::integer as year,
        s.code as state_code,
        SUM(rc.count) as total_count
      FROM refuge_counts rc
      JOIN locations l ON rc.location_id = l.id
      JOIN states s ON l.state_id = s.id
      WHERE rc.species_id = ${sp.id}
        AND rc.survey_type = 'mwi_annual'
      GROUP BY EXTRACT(YEAR FROM rc.survey_date), s.code
      ORDER BY year, s.code
    `)

    return {
      speciesSlug: id,
      isMigratory: true,
      flyways: filteredFlyways,
      currentLocations,
      historicalPatterns: historicalRows as unknown as Array<Record<string, unknown>>,
    }
  })
}
