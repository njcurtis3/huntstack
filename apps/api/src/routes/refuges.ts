import { FastifyPluginAsync } from 'fastify'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { locations, refugeCounts, species, states } from '@huntstack/db/schema'

export const refugeRoutes: FastifyPluginAsync = async (app) => {
  // List wildlife refuges
  app.get('/', {
    schema: {
      tags: ['refuges'],
      summary: 'List wildlife refuges with optional filters',
      querystring: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state code (e.g., TX)' },
          flyway: {
            type: 'string',
            enum: ['pacific', 'central', 'mississippi', 'atlantic'],
            description: 'Filter by flyway',
          },
        },
      },
    },
  }, async (request) => {
    const { state, flyway } = request.query as { state?: string; flyway?: string }
    const db = getDb()

    const conditions = [
      eq(locations.locationType, 'wildlife_refuge'),
      sql`${locations.name} NOT LIKE '% - Statewide MWI'`,
    ]

    if (state) {
      const stateRows = await db.select().from(states).where(eq(states.code, state.toUpperCase()))
      if (stateRows.length > 0) {
        conditions.push(eq(locations.stateId, stateRows[0].id))
      }
    }

    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        stateCode: states.code,
        stateName: states.name,
        centerPoint: locations.centerPoint,
        acreage: locations.acreage,
        websiteUrl: locations.websiteUrl,
        metadata: locations.metadata,
      })
      .from(locations)
      .innerJoin(states, eq(locations.stateId, states.id))
      .where(and(...conditions))
      .orderBy(states.code, locations.name)

    let result = rows
    if (flyway) {
      result = rows.filter(r => {
        const meta = r.metadata as Record<string, unknown> | null
        return meta?.flyway === flyway
      })
    }

    return {
      refuges: result.map(r => ({
        id: r.id,
        name: r.name,
        state: r.stateCode,
        stateName: r.stateName,
        centerPoint: r.centerPoint,
        acreage: r.acreage,
        websiteUrl: r.websiteUrl,
        flyway: (r.metadata as Record<string, unknown> | null)?.flyway || null,
        surveyUrl: (r.metadata as Record<string, unknown> | null)?.surveyUrl || null,
      })),
      count: result.length,
    }
  })

  // Get bird counts for a specific refuge
  app.get('/:id/counts', {
    schema: {
      tags: ['refuges'],
      summary: 'Get bird count time series for a refuge',
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
          species: { type: 'string', description: 'Filter by species slug' },
          startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          limit: { type: 'integer', default: 100, description: 'Max records to return' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const query = request.query as {
      species?: string
      startDate?: string
      endDate?: string
      limit?: number
    }
    const db = getDb()

    // Verify location exists
    const loc = await db.select().from(locations).where(eq(locations.id, id))
    if (loc.length === 0) {
      return reply.status(404).send({ error: true, message: 'Refuge not found' })
    }

    const conditions = [eq(refugeCounts.locationId, id)]

    if (query.species) {
      const spRows = await db.select().from(species).where(eq(species.slug, query.species))
      if (spRows.length > 0) {
        conditions.push(eq(refugeCounts.speciesId, spRows[0].id))
      }
    }

    if (query.startDate) {
      conditions.push(gte(refugeCounts.surveyDate, new Date(query.startDate)))
    }
    if (query.endDate) {
      conditions.push(lte(refugeCounts.surveyDate, new Date(query.endDate)))
    }

    const rows = await db
      .select({
        surveyDate: refugeCounts.surveyDate,
        count: refugeCounts.count,
        surveyType: refugeCounts.surveyType,
        speciesSlug: species.slug,
        speciesName: species.name,
        sourceUrl: refugeCounts.sourceUrl,
        observers: refugeCounts.observers,
        notes: refugeCounts.notes,
      })
      .from(refugeCounts)
      .innerJoin(species, eq(refugeCounts.speciesId, species.id))
      .where(and(...conditions))
      .orderBy(desc(refugeCounts.surveyDate))
      .limit(query.limit || 100)

    return {
      refuge: {
        id: loc[0].id,
        name: loc[0].name,
      },
      counts: rows,
      total: rows.length,
    }
  })

  // Migration dashboard — aggregated data across refuges
  app.get('/migration/dashboard', {
    schema: {
      tags: ['refuges'],
      summary: 'Migration intelligence dashboard data',
      querystring: {
        type: 'object',
        properties: {
          flyway: {
            type: 'string',
            enum: ['pacific', 'central', 'mississippi', 'atlantic'],
          },
          species: { type: 'string', description: 'Filter by species slug' },
        },
      },
    },
  }, async (request) => {
    const { flyway, species: speciesSlug } = request.query as {
      flyway?: string
      species?: string
    }
    const db = getDb()

    // Get latest counts by refuge (most recent survey per refuge+species)
    const latestCounts = await db.execute(sql`
      SELECT DISTINCT ON (rc.location_id, rc.species_id)
        rc.location_id,
        l.name as refuge_name,
        s.code as state_code,
        sp.slug as species_slug,
        sp.name as species_name,
        rc.count,
        rc.survey_date,
        rc.survey_type,
        l.center_point,
        l.metadata as location_metadata
      FROM refuge_counts rc
      JOIN locations l ON rc.location_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN species sp ON rc.species_id = sp.id
      WHERE l.name NOT LIKE '%% - Statewide MWI'
        ${speciesSlug ? sql`AND sp.slug = ${speciesSlug}` : sql``}
      ORDER BY rc.location_id, rc.species_id, rc.survey_date DESC
    `)

    let results = latestCounts as unknown as Array<Record<string, unknown>>

    // Filter by flyway if specified
    if (flyway) {
      results = results.filter(r => {
        const meta = r.location_metadata as Record<string, unknown> | null
        return meta?.flyway === flyway
      })
    }

    // Get historical MWI trends (annual totals by state)
    const historicalTrends = await db.execute(sql`
      SELECT
        EXTRACT(YEAR FROM rc.survey_date)::integer as year,
        s.code as state_code,
        sp.slug as species_slug,
        SUM(rc.count) as total_count
      FROM refuge_counts rc
      JOIN locations l ON rc.location_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN species sp ON rc.species_id = sp.id
      WHERE rc.survey_type = 'mwi_annual'
        ${speciesSlug ? sql`AND sp.slug = ${speciesSlug}` : sql``}
      GROUP BY EXTRACT(YEAR FROM rc.survey_date), s.code, sp.slug
      ORDER BY year, s.code
    `)

    return {
      currentCounts: results.map(r => ({
        refugeId: r.location_id,
        refugeName: r.refuge_name,
        state: r.state_code,
        species: r.species_slug,
        speciesName: r.species_name,
        count: r.count,
        surveyDate: r.survey_date,
        surveyType: r.survey_type,
        centerPoint: r.center_point,
        flyway: (r.location_metadata as Record<string, unknown> | null)?.flyway || null,
      })),
      historicalTrends: historicalTrends as unknown as Array<Record<string, unknown>>,
    }
  })
}
