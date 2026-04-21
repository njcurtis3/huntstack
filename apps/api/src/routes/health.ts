import { FastifyPluginAsync } from 'fastify'
import { getDb } from '../lib/db.js'
import { sql } from 'drizzle-orm'

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', {
    schema: {
      tags: ['health'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    }
  })

  app.get('/health/ready', {
    schema: {
      tags: ['health'],
      summary: 'Readiness check (includes database)',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            database: { type: 'string' },
            redis: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            database: { type: 'string' },
            redis: { type: 'string' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    let database = 'ok'

    try {
      const db = getDb()
      await db.execute(sql`SELECT 1`)
    } catch {
      database = 'error'
    }

    const status = database === 'ok' ? 'ok' : 'degraded'

    if (status !== 'ok') {
      return reply.status(503).send({ status, database, redis: 'disabled' })
    }

    return { status, database, redis: 'disabled' }
  })
}
