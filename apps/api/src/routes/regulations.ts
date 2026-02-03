import { FastifyPluginAsync } from 'fastify'

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
                  lastUpdated: { type: 'string' },
                  categories: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    // TODO: Fetch from database
    return {
      states: [
        { code: 'CO', name: 'Colorado', lastUpdated: '2025-01-15', categories: ['big-game', 'waterfowl'] },
        { code: 'MT', name: 'Montana', lastUpdated: '2025-01-10', categories: ['big-game', 'upland'] },
        // ... more states
      ],
    }
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
          species: { type: 'string', description: 'Filter by species' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            state: { type: 'object' },
            regulations: { type: 'array' },
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
    const { stateCode } = request.params as { stateCode: string }
    const { category, species } = request.query as { category?: string; species?: string }

    // TODO: Fetch from database
    // For now, return placeholder
    
    return {
      state: {
        code: stateCode.toUpperCase(),
        name: 'State Name', // Look up from DB
        lastUpdated: '2025-01-15',
        source: 'State Wildlife Agency',
        sourceUrl: 'https://example.com',
      },
      regulations: [],
      filters: {
        category,
        species,
      },
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
          species: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { stateCode } = request.params as { stateCode: string }
    const { year, species } = request.query as { year?: number; species?: string }

    // TODO: Fetch season data from database
    return {
      state: stateCode.toUpperCase(),
      year: year || new Date().getFullYear(),
      seasons: [],
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
          resident: { type: 'boolean', description: 'Resident vs non-resident' },
          species: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { stateCode } = request.params as { stateCode: string }
    const { resident, species } = request.query as { resident?: boolean; species?: string }

    // TODO: Fetch license data from database
    return {
      state: stateCode.toUpperCase(),
      licenses: [],
      filters: {
        resident,
        species,
      },
    }
  })
}
