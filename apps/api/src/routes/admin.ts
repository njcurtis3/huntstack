import type { FastifyPluginAsync } from 'fastify'
import { decorateAuthUser, parseAdminIds, requireAdmin, type VerifyUser } from '../lib/auth-guard.js'
import { UUID_RE, drizzleOutfitterStore, type OutfitterRecord, type OutfitterStore } from '../lib/outfitter-store.js'
import {
  approveSubmission,
  releaseListing,
  privateListingSchema,
  rejectSubmission,
  submissionSchema,
  toPublicListing,
  toSubmissionJson,
  validateRejectReason,
} from '../lib/outfitters.js'
import { verifyAccessTokenUser } from '../lib/supabase-auth.js'

// Moderation for outfitter submissions and listings. Every route sits behind requireAdmin: the
// verified Supabase user id must be in ADMIN_USER_IDS. Nothing in a body or header grants access.

export interface AdminDeps {
  store: OutfitterStore
  verifyUser: VerifyUser
  adminIds: ReadonlySet<string>
  now: () => Date
}

const errorBody = (statusCode: number, message: string) => ({ error: true, statusCode, message })
const nullableString = { type: 'string', nullable: true } as const

const adminListing = (r: OutfitterRecord) => ({ ...toPublicListing(r), isActive: r.isActive, ownerId: r.ownerId })

const adminSubmissionSchema = {
  ...submissionSchema,
  properties: {
    ...submissionSchema.properties,
    userId: { type: 'string' },
    submitterEmail: nullableString,
    current: { ...privateListingSchema, nullable: true },
    review: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        rating: { type: 'integer' },
        title: nullableString,
        content: nullableString,
      },
    },
  },
} as const

export function buildAdminRoutes(deps: AdminDeps): FastifyPluginAsync {
  const { store } = deps
  return async (app) => {
    decorateAuthUser(app)
    app.addHook('preHandler', requireAdmin({ verifyUser: deps.verifyUser, adminIds: deps.adminIds }))

    app.get<{ Querystring: { status: 'pending' | 'decided' } }>('/submissions', {
      schema: {
        tags: ['admin'],
        summary: 'Pending (oldest first) or recently decided submissions',
        querystring: {
          type: 'object',
          properties: { status: { type: 'string', enum: ['pending', 'decided'], default: 'pending' } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: { submissions: { type: 'array', items: adminSubmissionSchema } },
          },
        },
      },
    }, async (request) => {
      const rows = await store.listSubmissions(request.query.status)
      const submissions = []
      for (const s of rows) {
        const current = s.outfitterId ? await store.findById(s.outfitterId) : null
        const review = s.reviewId ? await store.getReview(s.reviewId) : null
        submissions.push({
          ...toSubmissionJson(s),
          userId: s.userId,
          submitterEmail: s.submitterEmail,
          current: current ? adminListing(current) : null,
          review: review ? { id: review.id, rating: review.rating, title: review.title, content: review.content } : null,
        })
      }
      return { submissions }
    })

    app.post<{ Params: { id: string } }>('/submissions/:id/approve', {
      schema: {
        tags: ['admin'],
        summary: 'Approve a submission and apply it',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: { submission: submissionSchema, outfitter: { ...privateListingSchema, nullable: true } },
          },
        },
      },
    }, async (request, reply) => {
      const flag = (request.body as { markVerified?: unknown } | null | undefined)?.markVerified
      if (flag !== undefined && typeof flag !== 'boolean') return reply.status(400).send(errorBody(400, 'markVerified must be true or false'))
      const result = await approveSubmission(store, request.authUser.id, request.params.id, flag === true, deps.now())
      if (!result.ok) return reply.status(result.status).send(errorBody(result.status, result.message))
      return { submission: toSubmissionJson(result.submission), outfitter: result.outfitter ? adminListing(result.outfitter) : null }
    })

    app.post<{ Params: { id: string } }>('/submissions/:id/reject', {
      schema: {
        tags: ['admin'],
        summary: 'Reject a submission with a reason the submitter will see',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: { 200: { type: 'object', additionalProperties: false, properties: { submission: submissionSchema } } },
      },
    }, async (request, reply) => {
      const reason = validateRejectReason(request.body)
      if (!reason.ok) return reply.status(400).send(errorBody(400, reason.message))
      const result = await rejectSubmission(store, request.authUser.id, request.params.id, reason.value, deps.now())
      if (!result.ok) return reply.status(result.status).send(errorBody(result.status, result.message))
      return { submission: toSubmissionJson(result.submission) }
    })

    app.get('/outfitters', {
      schema: {
        tags: ['admin'],
        summary: 'Every listing, inactive included',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: { outfitters: { type: 'array', items: privateListingSchema } },
          },
        },
      },
    }, async () => ({ outfitters: (await store.listAll()).map(adminListing) }))

    const outfitterResponse = {
      200: { type: 'object', additionalProperties: false, properties: { outfitter: privateListingSchema } },
    } as const

    app.post<{ Params: { id: string } }>('/outfitters/:id/active', {
      schema: {
        tags: ['admin'],
        summary: 'Show or hide a listing in the directory',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: outfitterResponse,
      },
    }, async (request, reply) => {
      const isActive = (request.body as { isActive?: unknown } | null | undefined)?.isActive
      if (typeof isActive !== 'boolean') return reply.status(400).send(errorBody(400, 'isActive must be true or false'))
      const { id } = request.params
      const updated = UUID_RE.test(id) ? await store.setActive(id.toLowerCase(), isActive, deps.now()) : null
      if (!updated) return reply.status(404).send(errorBody(404, 'Outfitter not found'))
      return { outfitter: adminListing(updated) }
    })

    app.post<{ Params: { id: string } }>('/outfitters/:id/release', {
      schema: {
        tags: ['admin'],
        summary: 'Remove the owner from a listing so it can be claimed again',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: outfitterResponse,
      },
    }, async (request, reply) => {
      const result = await releaseListing(store, request.authUser.id, request.params.id, deps.now())
      if (!result.ok) return reply.status(result.status).send(errorBody(result.status, result.message))
      return { outfitter: adminListing(result.outfitter) }
    })
  }
}

// Built at registration time, not import time, so ADMIN_USER_IDS from .env (loaded by index.ts) is seen.
export const adminRoutes: FastifyPluginAsync = async (app, opts) => {
  await buildAdminRoutes({
    store: drizzleOutfitterStore,
    verifyUser: verifyAccessTokenUser,
    adminIds: parseAdminIds(process.env.ADMIN_USER_IDS),
    now: () => new Date(),
  })(app, opts)
}
