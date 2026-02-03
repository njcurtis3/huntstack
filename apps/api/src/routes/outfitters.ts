import { FastifyPluginAsync } from 'fastify'

export const outfittersRoutes: FastifyPluginAsync = async (app) => {
  // List/search outfitters
  app.get('/', {
    schema: {
      tags: ['outfitters'],
      summary: 'List and search outfitters',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          state: { type: 'string', description: 'Filter by state code' },
          huntType: { type: 'string', description: 'Filter by hunt type' },
          species: { type: 'string', description: 'Filter by species' },
          minRating: { type: 'number', description: 'Minimum rating' },
          limit: { type: 'number', default: 20 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            outfitters: { type: 'array' },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request) => {
    const query = request.query as {
      q?: string
      state?: string
      huntType?: string
      species?: string
      minRating?: number
      limit?: number
      offset?: number
    }

    // TODO: Fetch from database
    return {
      outfitters: [],
      total: 0,
      filters: query,
    }
  })

  // Get single outfitter
  app.get('/:id', {
    schema: {
      tags: ['outfitters'],
      summary: 'Get outfitter details',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            outfitter: { type: 'object' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // TODO: Fetch from database
    return {
      outfitter: {
        id,
        name: 'Example Outfitter',
        // ... more fields
      },
    }
  })

  // Get outfitter reviews
  app.get('/:id/reviews', {
    schema: {
      tags: ['outfitters'],
      summary: 'Get outfitter reviews',
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
          limit: { type: 'number', default: 10 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { limit = 10, offset = 0 } = request.query as { limit?: number; offset?: number }

    // TODO: Fetch from database
    return {
      outfitterId: id,
      reviews: [],
      total: 0,
    }
  })

  // Create outfitter (for outfitter registration)
  app.post('/', {
    schema: {
      tags: ['outfitters'],
      summary: 'Register a new outfitter',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          location: { type: 'object' },
          huntTypes: { type: 'array', items: { type: 'string' } },
          species: { type: 'array', items: { type: 'string' } },
          contact: { type: 'object' },
        },
        required: ['name', 'location'],
      },
    },
  }, async (request, reply) => {
    // TODO: Implement outfitter creation
    // This would require authentication
    reply.status(501).send({
      error: true,
      message: 'Not implemented yet',
    })
  })
}
