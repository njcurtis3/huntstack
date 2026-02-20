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
      { url: 'http://localhost:4000', description: 'Development' },
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

// Global error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error)
  
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Internal Server Error' : error.message
  
  reply.status(statusCode).send({
    error: true,
    message,
    statusCode,
  })
})

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10)
    const host = process.env.HOST || '0.0.0.0'
    
    await app.listen({ port, host })
    app.log.info(`Server running at http://${host}:${port}`)
    app.log.info(`API docs available at http://${host}:${port}/docs`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
