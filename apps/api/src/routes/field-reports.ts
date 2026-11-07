import type { FastifyPluginAsync } from 'fastify'
import {
  MAX_LIST_ROWS,
  REPORTS_LABEL,
  USER_LIMIT_PER_DAY,
  USER_LIMIT_PER_HOUR,
  drizzleFieldReportStore,
  toPublic,
  validateReport,
  type FieldReportStore,
} from '../lib/field-reports.js'
import { AuthUnconfiguredError, verifyAccessToken } from '../lib/supabase-auth.js'

export interface FieldReportsDeps {
  store: FieldReportStore
  /** User id for a valid token, null for an invalid one; throws AuthUnconfiguredError when auth is not set up */
  verifyToken: (token: string) => Promise<string | null>
  now: () => Date
}

const DAY_MS = 24 * 60 * 60 * 1000

// The response schema is the second guard on privacy: fast-json-stringify drops any property not
// listed here, so an exact point or user id could not leak even if a store returned one.
const publicReportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    lat: { type: 'number' },
    lng: { type: 'number' },
    birdGroup: { type: 'string' },
    speciesSlug: { type: 'string', nullable: true },
    speciesLabel: { type: 'string' },
    countBucket: { type: 'string' },
    countExact: { type: 'integer', nullable: true },
    activity: { type: 'string', nullable: true },
    observedAt: { type: 'string' },
  },
} as const

export function buildFieldReportsRoutes(deps: FieldReportsDeps): FastifyPluginAsync {
  return async (app) => {
    app.post('/', {
      // Per-IP cap on top of the per-user counts below; keys on the real client IP via trustProxy.
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 hour',
          errorResponseBuilder: (_req, context) => ({
            error: true,
            statusCode: 429,
            message: `Too many reports from this network (limit ${context.max} per hour). Please try again later.`,
          }),
        },
      },
      schema: {
        tags: ['field-reports'],
        summary: 'Submit a hunter bird report (signed in)',
        response: { 201: publicReportSchema },
      },
    }, async (request, reply) => {
      const header = request.headers.authorization
      const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null
      if (!match) return reply.status(401).send({ error: true, statusCode: 401, message: 'Sign in to report birds' })

      let userId: string | null
      try {
        userId = await deps.verifyToken(match[1])
      } catch (err) {
        if (err instanceof AuthUnconfiguredError) {
          return reply.status(503).send({ error: true, statusCode: 503, message: 'Reporting is not available right now' })
        }
        throw err
      }
      if (!userId) return reply.status(401).send({ error: true, statusCode: 401, message: 'Your session is not valid. Please sign in again.' })

      const now = deps.now()
      const result = validateReport(request.body, now)
      if (!result.ok) return reply.status(400).send({ error: true, statusCode: 400, message: result.message })

      const stored = await deps.store.insertIfUnderLimits(
        { userId, ...result.value },
        { now, perHour: USER_LIMIT_PER_HOUR, perDay: USER_LIMIT_PER_DAY },
      )
      if (stored.limited) {
        return reply.status(429).send({
          error: true,
          statusCode: 429,
          message: `You can submit ${USER_LIMIT_PER_HOUR} reports an hour and ${USER_LIMIT_PER_DAY} a day. Please try again later.`,
        })
      }

      return reply.status(201).send(toPublic(stored.row))
    })

    app.get<{ Querystring: { days: number } }>('/', {
      schema: {
        tags: ['field-reports'],
        summary: 'Recent hunter reports, rounded to a 0.05-degree cell and unverified',
        querystring: {
          type: 'object',
          properties: { days: { type: 'integer', minimum: 1, maximum: 7, default: 7 } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              days: { type: 'integer' },
              reports: { type: 'array', items: publicReportSchema },
            },
          },
        },
      },
    }, async (request) => {
      const { days } = request.query
      const since = new Date(deps.now().getTime() - days * DAY_MS)
      const rows = await deps.store.listSince(since, MAX_LIST_ROWS)
      return { label: REPORTS_LABEL, days, reports: rows.map(toPublic) }
    })
  }
}

export const fieldReportsRoutes = buildFieldReportsRoutes({
  store: drizzleFieldReportStore,
  verifyToken: verifyAccessToken,
  now: () => new Date(),
})
