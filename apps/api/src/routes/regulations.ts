import { FastifyPluginAsync } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { states, regulations, seasons, licenses, species } from '@huntstack/db/schema'

export const regulationsRoutes: FastifyPluginAsync = async (app) => {
  // List all states with regulations
  app.get('/states', {
    schema: {
      tags: ['regulations'],
      summary: 'List all states with available regulations',
      response: {
        200: {
          type: 'object',
          properties: {
            states: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                  agencyName: { type: 'string' },
                  agencyUrl: { type: 'string' },
                  regulationsUrl: { type: 'string' },
                  licenseUrl: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    const db = getDb()
    const rows = await db.select({
      code: states.code,
      name: states.name,
      agencyName: states.agencyName,
      agencyUrl: states.agencyUrl,
      regulationsUrl: states.regulationsUrl,
      licenseUrl: states.licenseUrl,
    }).from(states)

    return { states: rows }
  })

  // Get regulations for a specific state
  app.get('/:stateCode', {
    schema: {
      tags: ['regulations'],
      summary: 'Get regulations for a specific state',
      params: {
        type: 'object',
        properties: {
          stateCode: { type: 'string', description: 'Two-letter state code' },
        },
        required: ['stateCode'],
      },
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category (big-game, waterfowl, etc.)' },
          species: { type: 'string', description: 'Filter by species slug' },
        },
      },
    },
  }, async (request, reply) => {
    const { stateCode } = request.params as { stateCode: string }
    const { category, species: speciesSlug } = request.query as { category?: string; species?: string }

    const db = getDb()
    const code = stateCode.toUpperCase()

    // Look up the state
    const stateRows = await db.select().from(states).where(eq(states.code, code))
    if (stateRows.length === 0) {
      return reply.status(404).send({ error: true, message: `State '${code}' not found` })
    }
    const state = stateRows[0]

    // Build filters for regulations query
    const conditions = [eq(regulations.stateId, state.id), eq(regulations.isActive, true)]

    if (category) {
      conditions.push(eq(regulations.category, category))
    }

    // If filtering by species slug, resolve to species ID first
    if (speciesSlug) {
      const speciesRows = await db.select({ id: species.id }).from(species).where(eq(species.slug, speciesSlug))
      if (speciesRows.length > 0) {
        conditions.push(eq(regulations.speciesId, speciesRows[0].id))
      }
    }

    const regs = await db.select({
      id: regulations.id,
      category: regulations.category,
      title: regulations.title,
      content: regulations.content,
      summary: regulations.summary,
      seasonYear: regulations.seasonYear,
      effectiveDate: regulations.effectiveDate,
      expirationDate: regulations.expirationDate,
      sourceUrl: regulations.sourceUrl,
      metadata: regulations.metadata,
    }).from(regulations).where(and(...conditions))

    return {
      state: {
        code: state.code,
        name: state.name,
        agencyName: state.agencyName,
        agencyUrl: state.agencyUrl,
        regulationsUrl: state.regulationsUrl,
        licenseUrl: state.licenseUrl,
        lastScraped: state.lastScraped,
      },
      regulations: regs,
    }
  })

  // Get seasons for a state
  app.get('/:stateCode/seasons', {
    schema: {
      tags: ['regulations'],
      summary: 'Get hunting seasons for a state',
      params: {
        type: 'object',
        properties: {
          stateCode: { type: 'string' },
        },
        required: ['stateCode'],
      },
      querystring: {
        type: 'object',
        properties: {
          year: { type: 'number', description: 'Season year' },
          species: { type: 'string', description: 'Filter by species slug' },
        },
      },
    },
  }, async (request, reply) => {
    const { stateCode } = request.params as { stateCode: string }
    const { year, species: speciesSlug } = request.query as { year?: number; species?: string }

    const db = getDb()
    const code = stateCode.toUpperCase()

    const stateRows = await db.select().from(states).where(eq(states.code, code))
    if (stateRows.length === 0) {
      return reply.status(404).send({ error: true, message: `State '${code}' not found` })
    }
    const state = stateRows[0]

    const conditions = [eq(seasons.stateId, state.id)]

    if (year) {
      conditions.push(eq(seasons.year, year))
    }

    if (speciesSlug) {
      const speciesRows = await db.select({ id: species.id }).from(species).where(eq(species.slug, speciesSlug))
      if (speciesRows.length > 0) {
        conditions.push(eq(seasons.speciesId, speciesRows[0].id))
      }
    }

    const seasonRows = await db.select({
      id: seasons.id,
      name: seasons.name,
      seasonType: seasons.seasonType,
      startDate: seasons.startDate,
      endDate: seasons.endDate,
      year: seasons.year,
      bagLimit: seasons.bagLimit,
      shootingHours: seasons.shootingHours,
      restrictions: seasons.restrictions,
      units: seasons.units,
      sourceUrl: seasons.sourceUrl,
      speciesId: seasons.speciesId,
    }).from(seasons).where(and(...conditions))

    return {
      state: code,
      year: year || new Date().getFullYear(),
      seasons: seasonRows,
    }
  })

  // Get license requirements for a state
  app.get('/:stateCode/licenses', {
    schema: {
      tags: ['regulations'],
      summary: 'Get license requirements for a state',
      params: {
        type: 'object',
        properties: {
          stateCode: { type: 'string' },
        },
        required: ['stateCode'],
      },
      querystring: {
        type: 'object',
        properties: {
          resident: { type: 'boolean', description: 'Filter resident-only licenses' },
          type: { type: 'string', description: 'Filter by license type (base, species, stamp, permit)' },
        },
      },
    },
  }, async (request, reply) => {
    const { stateCode } = request.params as { stateCode: string }
    const { resident, type } = request.query as { resident?: boolean; type?: string }

    const db = getDb()
    const code = stateCode.toUpperCase()

    const stateRows = await db.select().from(states).where(eq(states.code, code))
    if (stateRows.length === 0) {
      return reply.status(404).send({ error: true, message: `State '${code}' not found` })
    }
    const state = stateRows[0]

    const conditions = [eq(licenses.stateId, state.id)]

    if (resident !== undefined) {
      conditions.push(eq(licenses.isResidentOnly, resident))
    }

    if (type) {
      conditions.push(eq(licenses.licenseType, type))
    }

    const licenseRows = await db.select({
      id: licenses.id,
      name: licenses.name,
      licenseType: licenses.licenseType,
      description: licenses.description,
      isResidentOnly: licenses.isResidentOnly,
      priceResident: licenses.priceResident,
      priceNonResident: licenses.priceNonResident,
      validFor: licenses.validFor,
      requirements: licenses.requirements,
      applicationDeadline: licenses.applicationDeadline,
      purchaseUrl: licenses.purchaseUrl,
    }).from(licenses).where(and(...conditions))

    return {
      state: code,
      licenses: licenseRows,
    }
  })
}
