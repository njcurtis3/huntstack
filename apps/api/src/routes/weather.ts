import { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { locations, states } from '@huntstack/db/schema'
import { getForecast, getAlerts, getHuntingConditions } from '../lib/weather.js'

const DEFAULT_STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK']

export const weatherRoutes: FastifyPluginAsync = async (app) => {
  // 7-day forecast for a specific refuge
  app.get('/forecast/:refugeId', {
    schema: {
      tags: ['weather'],
      summary: '7-day forecast for a wildlife refuge',
      params: {
        type: 'object',
        properties: {
          refugeId: { type: 'string' },
        },
        required: ['refugeId'],
      },
    },
  }, async (request, reply) => {
    const { refugeId } = request.params as { refugeId: string }
    const db = getDb()

    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        centerPoint: locations.centerPoint,
        stateCode: states.code,
      })
      .from(locations)
      .innerJoin(states, eq(locations.stateId, states.id))
      .where(eq(locations.id, refugeId))

    if (rows.length === 0) {
      return reply.status(404).send({ error: true, message: 'Refuge not found' })
    }

    const loc = rows[0]
    const cp = loc.centerPoint as { lat: number; lng: number } | null
    if (!cp) {
      return reply.status(404).send({ error: true, message: 'Refuge has no coordinates' })
    }

    const forecast = await getForecast(cp.lat, cp.lng)
    if (!forecast) {
      return reply.status(503).send({ error: true, message: 'Weather data temporarily unavailable' })
    }

    return {
      refuge: { id: loc.id, name: loc.name, state: loc.stateCode },
      forecast,
    }
  })

  // Active weather alerts for specified states
  app.get('/alerts', {
    schema: {
      tags: ['weather'],
      summary: 'Active weather alerts for specified states',
      querystring: {
        type: 'object',
        properties: {
          states: {
            type: 'string',
            description: 'Comma-separated state codes, e.g. TX,OK,AR',
          },
        },
      },
    },
  }, async (request) => {
    const { states: statesParam } = request.query as { states?: string }

    const stateCodes = statesParam
      ? statesParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 2)
      : DEFAULT_STATES

    const allAlerts = await Promise.all(stateCodes.map(s => getAlerts(s)))
    const flat = allAlerts.flat()

    // Deduplicate by id
    const seen = new Set<string>()
    const unique = flat.filter(a => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })

    // Sort by severity (Extreme > Severe > Moderate > Minor)
    const severityOrder: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 }
    unique.sort((a, b) => {
      const sa = severityOrder[a.severity] ?? 4
      const sb = severityOrder[b.severity] ?? 4
      if (sa !== sb) return sa - sb
      return new Date(b.effective).getTime() - new Date(a.effective).getTime()
    })

    return {
      alerts: unique,
      states: stateCodes,
      fetchedAt: new Date().toISOString(),
    }
  })

  // Hunting-specific weather summary for a refuge
  app.get('/hunting-conditions/:refugeId', {
    schema: {
      tags: ['weather'],
      summary: 'Hunting-specific weather conditions for a refuge',
      params: {
        type: 'object',
        properties: {
          refugeId: { type: 'string' },
        },
        required: ['refugeId'],
      },
    },
  }, async (request, reply) => {
    const { refugeId } = request.params as { refugeId: string }
    const db = getDb()

    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        centerPoint: locations.centerPoint,
        stateCode: states.code,
      })
      .from(locations)
      .innerJoin(states, eq(locations.stateId, states.id))
      .where(eq(locations.id, refugeId))

    if (rows.length === 0) {
      return reply.status(404).send({ error: true, message: 'Refuge not found' })
    }

    const loc = rows[0]
    const cp = loc.centerPoint as { lat: number; lng: number } | null
    if (!cp) {
      return reply.status(404).send({ error: true, message: 'Refuge has no coordinates' })
    }

    const conditions = await getHuntingConditions(cp.lat, cp.lng, loc.stateCode)
    if (!conditions) {
      return reply.status(503).send({ error: true, message: 'Weather data temporarily unavailable' })
    }

    return {
      refuge: { id: loc.id, name: loc.name, state: loc.stateCode },
      conditions,
    }
  })
}
