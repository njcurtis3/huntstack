import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(import.meta.dirname, '../../../.env') })

import { healthRoutes } from './routes/health.js'
import { searchRoutes } from './routes/search.js'
import { regulationsRoutes } from './routes/regulations.js'
import { outfittersRoutes } from './routes/outfitters.js'
import { chatRoutes } from './routes/chat.js'
import { speciesRoutes } from './routes/species.js'
import { refugeRoutes } from './routes/refuges.js'
import { weatherRoutes } from './routes/weather.js'
import { huntRoutes } from './routes/hunt.js'
import { migrationRoutes } from './routes/migration.js'
import { geoRoutes } from './routes/geo.js'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' 
      ? { target: 'pino-pretty' }
      : undefined,
  },
})

// Security plugins
await app.register(helmet)
await app.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
})
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

// API Documentation
await app.register(swagger, {
  openapi: {
    info: {
      title: 'HuntStack API',
      description: 'API for hunting regulations, locations, and AI-powered search',
      version: '0.1.0',
    },
    servers: [
      { url: 'http://localhost:4001', description: 'Development' },
    ],
    tags: [
      { name: 'health', description: 'Health check endpoints' },
      { name: 'search', description: 'Search across all hunting data' },
      { name: 'regulations', description: 'Hunting regulations by state' },
      { name: 'outfitters', description: 'Outfitter directory' },
      { name: 'species', description: 'Species information' },
      { name: 'chat', description: 'AI-powered Q&A' },
      { name: 'refuges', description: 'Wildlife refuges and migration data' },
      { name: 'weather', description: 'NOAA weather forecasts and hunting conditions' },
      { name: 'hunt', description: 'Hunt recommendations and opportunity scoring' },
      { name: 'migration', description: 'Migration push factors and intelligence' },
    ],
  },
})
await app.register(swaggerUi, {
  routePrefix: '/docs',
})

// Register routes
await app.register(healthRoutes, { prefix: '/api' })
await app.register(searchRoutes, { prefix: '/api/search' })
await app.register(regulationsRoutes, { prefix: '/api/regulations' })
await app.register(outfittersRoutes, { prefix: '/api/outfitters' })
await app.register(speciesRoutes, { prefix: '/api/species' })
await app.register(chatRoutes, { prefix: '/api/chat' })
await app.register(refugeRoutes, { prefix: '/api/refuges' })
await app.register(weatherRoutes, { prefix: '/api/weather' })
await app.register(huntRoutes, { prefix: '/api/hunt' })
await app.register(migrationRoutes, { prefix: '/api/migration' })
await app.register(geoRoutes, { prefix: '/api/geo' })

// Global error handler
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Internal Server Error' : error.message
  
  reply.status(statusCode).send({
    error: true,
    message,
    statusCode,
  })
})

// Graceful shutdown — ensures the TCP socket is released before tsx watch
// spawns the next process, preventing EADDRINUSE on hot-reload
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down`)
  try {
    await app.close()
  } catch (err) {
    app.log.error(err)
  }
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Start server — retries on EADDRINUSE to handle the Windows tsx watch
// race condition where the OS hasn't released the port before the new
// process spawns (tsx uses TerminateProcess which bypasses signal handlers)
const start = async () => {
  const port = parseInt(process.env.PORT || '4001', 10)
  const host = process.env.HOST || '0.0.0.0'
  const maxAttempts = 8

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await app.listen({ port, host })
      app.log.info(`Server running at http://${host}:${port}`)
      app.log.info(`API docs available at http://${host}:${port}/docs`)
      return
    } catch (err: unknown) {
      const isAddrInUse = (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
      if (isAddrInUse && attempt < maxAttempts) {
        const delay = attempt * 300
        app.log.warn(`Port ${port} in use, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        app.log.error(err)
        process.exit(1)
      }
    }
  }
}

start()
