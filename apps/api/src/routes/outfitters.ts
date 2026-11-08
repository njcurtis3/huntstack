import type { FastifyPluginAsync } from 'fastify'
import { decorateAuthUser, requireUser, type VerifyUser } from '../lib/auth-guard.js'
import { drizzleOutfitterStore, type OutfitterStore } from '../lib/outfitter-store.js'
import { createViewCounter, type ViewCounter } from '../lib/outfitter-views.js'
import {
  createInquiry,
  filterListings,
  listingSchema,
  statesFacet,
  toPublicListing,
  validateInquiryBody,
} from '../lib/outfitters.js'
import { verifyAccessTokenUser } from '../lib/supabase-auth.js'

// The public outfitter directory, now read from the outfitters table (the 14 Texas listings were
// seeded from scripts/seed-outfitters-tx.sql). Every response goes through toPublicListing and a
// response schema, so owner ids, metadata and the legacy ids cannot leak.

export interface OutfittersDeps {
  store: OutfitterStore
  verifyUser: VerifyUser
  now: () => Date
  viewCounter: ViewCounter
}

const nullableString = { type: 'string', nullable: true } as const

const errorBody = (statusCode: number, message: string) => ({ error: true, statusCode, message })

// Per-IP cap on top of the global limit; keys on the real client IP via trustProxy (index.ts).
function ipLimit(what: string, max: number) {
  return {
    rateLimit: {
      max,
      timeWindow: '1 hour',
      errorResponseBuilder: (_req: unknown, context: { max: number }) =>
        errorBody(429, `Too many ${what} from this network (limit ${context.max} per hour). Please try again later.`),
    },
  }
}

export function buildOutfittersRoutes(deps: OutfittersDeps): FastifyPluginAsync {
  const { store } = deps
  return async (app) => {
    decorateAuthUser(app)
    const viewer = (request: { ip: string; headers: Record<string, unknown> }) => ({
      ip: request.ip,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    })

    app.get('/', {
      schema: {
        tags: ['outfitters'],
        summary: 'List and search outfitters',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            state: { type: 'string' },
            species: { type: 'string' },
            priceRange: { type: 'string' },
            limit: { type: 'number', default: 50, minimum: 1, maximum: 100 },
            offset: { type: 'number', default: 0, minimum: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              outfitters: { type: 'array', items: listingSchema },
              total: { type: 'number' },
              states: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    }, async (request) => {
      const { q, state, species, priceRange, limit = 50, offset = 0 } = request.query as {
        q?: string
        state?: string
        species?: string
        priceRange?: string
        limit?: number
        offset?: number
      }

      const active = await store.listActive()
      const results = filterListings(active, { q, state, species, priceRange })
      const page = results.slice(offset, offset + limit)
      void deps.viewCounter.record(viewer(request), page.map(o => ({ outfitterId: o.id, kind: 'impression' as const })), request.log)
      return { outfitters: page.map(toPublicListing), total: results.length, states: statesFacet(active) }
    })

    app.get('/claimable', {
      schema: {
        tags: ['outfitters'],
        summary: 'Active listings nobody has claimed yet',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              outfitters: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    slug: { type: 'string' },
                    name: { type: 'string' },
                    city: { type: 'string' },
                    state: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    }, async () => {
      const active = await store.listActive()
      return {
        outfitters: active
          .filter(o => o.ownerId === null)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(o => ({ id: o.id, slug: o.slug, name: o.name, city: o.city, state: o.state })),
      }
    })

    app.get<{ Params: { idOrSlug: string } }>('/:idOrSlug', {
      schema: {
        tags: ['outfitters'],
        summary: 'Get outfitter details (uuid, slug or legacy id)',
        params: { type: 'object', properties: { idOrSlug: { type: 'string' } }, required: ['idOrSlug'] },
        response: {
          200: { type: 'object', additionalProperties: false, properties: { outfitter: listingSchema } },
        },
      },
    }, async (request, reply) => {
      const outfitter = await store.findActive(request.params.idOrSlug)
      if (!outfitter) return reply.status(404).send(errorBody(404, 'Outfitter not found'))
      void deps.viewCounter.record(viewer(request), [{ outfitterId: outfitter.id, kind: 'detail' }], request.log)
      return { outfitter: toPublicListing(outfitter) }
    })

    app.get<{ Params: { idOrSlug: string } }>('/:idOrSlug/reviews', {
      schema: {
        tags: ['outfitters'],
        summary: 'Reviews for an outfitter, with approved owner replies',
        params: { type: 'object', properties: { idOrSlug: { type: 'string' } }, required: ['idOrSlug'] },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              reviews: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    rating: { type: 'integer' },
                    title: nullableString,
                    content: nullableString,
                    huntDate: nullableString,
                    createdAt: { type: 'string' },
                    reply: {
                      type: 'object',
                      nullable: true,
                      additionalProperties: false,
                      properties: { body: { type: 'string' }, updatedAt: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }, async (request, reply) => {
      const outfitter = await store.findActive(request.params.idOrSlug)
      if (!outfitter) return reply.status(404).send(errorBody(404, 'Outfitter not found'))
      const rows = await store.listReviews(outfitter.id)
      return {
        reviews: rows.map(r => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          content: r.content,
          huntDate: r.huntDate ? r.huntDate.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          reply: r.reply ? { body: r.reply.body, updatedAt: r.reply.updatedAt.toISOString() } : null,
        })),
      }
    })

    app.post<{ Params: { id: string } }>('/:id/contact-click', {
      config: ipLimit('contact clicks', 60),
      schema: {
        tags: ['outfitters'],
        summary: 'Count a call or website click on a listing',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    }, async (request, reply) => {
      const kind = (request.body as { kind?: unknown } | null | undefined)?.kind
      const outfitter = await store.findActive(request.params.id)
      if (!outfitter) return reply.status(404).send(errorBody(404, 'Outfitter not found'))
      if (kind !== 'call' && kind !== 'website') return reply.status(400).send(errorBody(400, 'kind must be call or website'))
      void deps.viewCounter.record(viewer(request), [{ outfitterId: outfitter.id, kind: 'contact' }], request.log)
      return reply.status(204).send()
    })

    app.post<{ Params: { id: string } }>('/:id/inquiries', {
      config: ipLimit('inquiries', 20),
      preHandler: requireUser({ verifyUser: deps.verifyUser }),
      schema: {
        tags: ['outfitters'],
        summary: 'Send an inquiry to a claimed outfitter (signed in)',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            properties: { id: { type: 'string' }, createdAt: { type: 'string' } },
          },
        },
      },
    }, async (request, reply) => {
      const outfitter = await store.findActive(request.params.id)
      if (!outfitter) return reply.status(404).send(errorBody(404, 'Outfitter not found'))
      if (outfitter.ownerId === null) return reply.status(409).send(errorBody(409, 'This outfitter has not claimed their listing yet'))
      const input = validateInquiryBody(request.body)
      if (!input.ok) return reply.status(400).send(errorBody(400, input.message))
      const { id, email } = request.authUser
      if (!email) return reply.status(400).send(errorBody(400, 'Your account needs an email address to send an inquiry'))

      const result = await createInquiry(store, { id, email }, outfitter.id, input.value, deps.now())
      if (!result.ok) return reply.status(result.status).send(errorBody(result.status, result.message))
      return reply.status(201).send({ id: result.inquiry.id, createdAt: result.inquiry.createdAt.toISOString() })
    })
  }
}

export const outfittersRoutes = buildOutfittersRoutes({
  store: drizzleOutfitterStore,
  verifyUser: verifyAccessTokenUser,
  now: () => new Date(),
  viewCounter: createViewCounter({ store: drizzleOutfitterStore, now: () => new Date() }),
})
