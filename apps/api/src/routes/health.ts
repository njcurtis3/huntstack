import { FastifyPluginAsync } from 'fastify'

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
      },
    },
  }, async () => {
    // TODO: Add actual database and redis checks
    return {
      status: 'ok',
      database: 'ok', // Will check Supabase connection
      redis: 'ok',    // Will check Redis connection
    }
  })
}
