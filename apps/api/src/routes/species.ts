import { FastifyPluginAsync } from 'fastify'

export const speciesRoutes: FastifyPluginAsync = async (app) => {
  // List all species
  app.get('/', {
    schema: {
      tags: ['species'],
      summary: 'List all huntable species',
      querystring: {
        type: 'object',
        properties: {
          category: { 
            type: 'string', 
            enum: ['big-game', 'waterfowl', 'upland', 'small-game', 'migratory'],
            description: 'Filter by category' 
          },
          state: { type: 'string', description: 'Filter by state where species is huntable' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            species: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  scientificName: { type: 'string' },
                  category: { type: 'string' },
                  states: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const { category, state } = request.query as { category?: string; state?: string }

    // TODO: Fetch from database
    return {
      species: [
        { 
          id: 'whitetail-deer', 
          name: 'Whitetail Deer', 
          scientificName: 'Odocoileus virginianus',
          category: 'big-game',
          states: ['TX', 'WI', 'MI', '...48 more'],
        },
        { 
          id: 'elk', 
          name: 'Elk', 
          scientificName: 'Cervus canadensis',
          category: 'big-game',
          states: ['CO', 'MT', 'WY', 'ID', 'NM', 'AZ', 'UT', 'WA', 'OR', 'KS', 'KY', 'PA'],
        },
        { 
          id: 'mallard', 
          name: 'Mallard', 
          scientificName: 'Anas platyrhynchos',
          category: 'waterfowl',
          states: ['All 50 states'],
        },
      ],
      filters: { category, state },
    }
  })

  // Get species details
  app.get('/:id', {
    schema: {
      tags: ['species'],
      summary: 'Get species details',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }

    // TODO: Fetch from database
    return {
      species: {
        id,
        name: 'Species Name',
        scientificName: 'Scientific name',
        category: 'big-game',
        description: 'Description of the species...',
        states: [],
        habitat: '',
        seasons: [],
      },
    }
  })

  // Get species regulations across states
  app.get('/:id/regulations', {
    schema: {
      tags: ['species'],
      summary: 'Get regulations for a species across all states',
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
          state: { type: 'string', description: 'Filter to specific state' },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { state } = request.query as { state?: string }

    // TODO: Fetch from database
    return {
      speciesId: id,
      regulations: [],
      filters: { state },
    }
  })

  // Get migration data for migratory species
  app.get('/:id/migration', {
    schema: {
      tags: ['species'],
      summary: 'Get migration patterns for a species',
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
          flyway: { 
            type: 'string', 
            enum: ['pacific', 'central', 'mississippi', 'atlantic'],
            description: 'Filter by flyway' 
          },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { flyway } = request.query as { flyway?: string }

    // TODO: Fetch migration data from eBird or other sources
    return {
      speciesId: id,
      isMigratory: true,
      flyways: [],
      currentLocations: [], // From real-time tracking data
      historicalPatterns: [],
    }
  })
}
