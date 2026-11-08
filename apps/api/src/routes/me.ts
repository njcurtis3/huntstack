import type { FastifyPluginAsync } from 'fastify'
import { decorateAuthUser, parseAdminIds, requireUser, type VerifyUser } from '../lib/auth-guard.js'
import { UUID_RE, drizzleOutfitterStore, type InquiryStatus, type OutfitterStore } from '../lib/outfitter-store.js'
import {
  buildDailyStats,
  ownListingSchema,
  submissionSchema,
  submitChange,
  submitReply,
  toPublicListing,
  toSubmissionJson,
  utcDay,
  validateReplyBody,
  validateSubmissionRequest,
} from '../lib/outfitters.js'
import { verifyAccessTokenUser } from '../lib/supabase-auth.js'

// The signed-in user's own account: who they are, their outfitter listing, the changes they have
// proposed, and the dashboard data for a listing they own. Everything is scoped by the verified
// user id (request.authUser); nothing in a body or header can name another user.

export interface MeDeps {
  store: OutfitterStore
  verifyUser: VerifyUser
  adminIds: ReadonlySet<string>
  now: () => Date
}

const DAY_MS = 24 * 60 * 60 * 1000
const INQUIRY_STATUSES: readonly InquiryStatus[] = ['new', 'read', 'archived']

const errorBody = (statusCode: number, message: string) => ({ error: true, statusCode, message })
const nullableString = { type: 'string', nullable: true } as const

// Per-IP cap on top of the per-user counts in the rules; keys on the real client IP via trustProxy.
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

const NO_LISTING = 'You do not have a listing yet'

export function buildMeRoutes(deps: MeDeps): FastifyPluginAsync {
  const { store } = deps
  return async (app) => {
    decorateAuthUser(app)
    app.addHook('preHandler', requireUser({ verifyUser: deps.verifyUser }))

    app.get('/', {
      schema: {
        tags: ['me'],
        summary: 'The signed-in user',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: { userId: { type: 'string' }, email: nullableString, isAdmin: { type: 'boolean' } },
          },
        },
      },
    }, async (request) => {
      const { id, email } = request.authUser
      // Admin comes only from the allow-list matched against the verified id
      return { userId: id, email, isAdmin: deps.adminIds.has(id.toLowerCase()) }
    })

    app.get('/outfitter', {
      schema: {
        tags: ['me'],
        summary: 'My listing, pending change and last decision',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              listing: { ...ownListingSchema, nullable: true },
              pending: { ...submissionSchema, nullable: true },
              lastDecision: { ...submissionSchema, nullable: true },
            },
          },
        },
      },
    }, async (request) => {
      const { id } = request.authUser
      const listing = await store.findByOwner(id)
      const pending = (await store.pendingForUser(id)) ?? (listing ? await store.pendingEditFor(listing.id) : null)
      const last = await store.lastDecision(id)
      return {
        listing: listing ? { ...toPublicListing(listing), isActive: listing.isActive } : null,
        pending: pending ? toSubmissionJson(pending) : null,
        lastDecision: last ? toSubmissionJson(last) : null,
      }
    })

    app.post('/outfitter/submissions', {
      config: ipLimit('submissions', 30),
      schema: { tags: ['me'], summary: 'Propose a new listing, an edit or a claim', response: { 201: submissionSchema } },
    }, async (request, reply) => {
      const parsed = validateSubmissionRequest(request.body)
      if (!parsed.ok) return reply.status(400).send(errorBody(400, parsed.message))
      const result = await submitChange(store, request.authUser, parsed.value, deps.now())
      if (!result.ok) return reply.status(result.status).send(errorBody(result.status, result.message))
      return reply.status(201).send(toSubmissionJson(result.submission))
    })

    app.post<{ Params: { id: string } }>('/outfitter/submissions/:id/withdraw', {
      schema: {
        tags: ['me'],
        summary: 'Withdraw one of my pending submissions',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: { 200: submissionSchema },
      },
    }, async (request, reply) => {
      const { id } = request.params
      const withdrawn = UUID_RE.test(id) ? await store.withdraw(id.toLowerCase(), request.authUser.id, deps.now()) : null
      if (!withdrawn) return reply.status(404).send(errorBody(404, 'Submission not found'))
      return toSubmissionJson(withdrawn)
    })

    app.get<{ Querystring: { days: number } }>('/outfitter/stats', {
      schema: {
        tags: ['me'],
        summary: 'Daily views, detail opens and contact clicks for my listing',
        querystring: {
          type: 'object',
          properties: { days: { type: 'integer', enum: [7, 30, 90], default: 30 } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              days: { type: 'integer' },
              totals: {
                type: 'object',
                additionalProperties: false,
                properties: { impression: { type: 'integer' }, detail: { type: 'integer' }, contact: { type: 'integer' } },
              },
              daily: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    day: { type: 'string' },
                    impression: { type: 'integer' },
                    detail: { type: 'integer' },
                    contact: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    }, async (request, reply) => {
      const listing = await store.findByOwner(request.authUser.id)
      if (!listing) return reply.status(404).send(errorBody(404, NO_LISTING))
      const { days } = request.query
      const now = deps.now()
      const rows = await store.viewCounts(listing.id, utcDay(new Date(now.getTime() - (days - 1) * DAY_MS)), utcDay(now))
      const daily = buildDailyStats(rows, days, now)
      const totals = { impression: 0, detail: 0, contact: 0 }
      for (const d of daily) {
        totals.impression += d.impression
        totals.detail += d.detail
        totals.contact += d.contact
      }
      return { days, totals, daily }
    })

    app.get('/outfitter/reviews', {
      schema: {
        tags: ['me'],
        summary: 'Reviews on my listing with replies and any reply awaiting approval',
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
                    pendingReply: {
                      type: 'object',
                      nullable: true,
                      additionalProperties: false,
                      properties: { submissionId: { type: 'string' }, body: { type: 'string' }, createdAt: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }, async (request, reply) => {
      const listing = await store.findByOwner(request.authUser.id)
      if (!listing) return reply.status(404).send(errorBody(404, NO_LISTING))
      const [rows, pendingReplies] = await Promise.all([store.listReviews(listing.id), store.pendingRepliesFor(listing.id)])
      const pendingByReview = new Map(pendingReplies.map(p => [p.reviewId, p]))
      return {
        reviews: rows.map(r => {
          const p = pendingByReview.get(r.id)
          return {
            id: r.id,
            rating: r.rating,
            title: r.title,
            content: r.content,
            huntDate: r.huntDate ? r.huntDate.toISOString() : null,
            createdAt: r.createdAt.toISOString(),
            reply: r.reply ? { body: r.reply.body, updatedAt: r.reply.updatedAt.toISOString() } : null,
            pendingReply: p ? { submissionId: p.id, body: (p.payload as { body: string }).body, createdAt: p.createdAt.toISOString() } : null,
          }
        }),
      }
    })

    app.post<{ Params: { reviewId: string } }>('/outfitter/reviews/:reviewId/reply', {
      config: ipLimit('replies', 30),
      schema: {
        tags: ['me'],
        summary: 'Reply to a review on my listing (held for approval)',
        params: { type: 'object', properties: { reviewId: { type: 'string' } }, required: ['reviewId'] },
        response: { 201: submissionSchema },
      },
    }, async (request, reply) => {
      const parsed = validateReplyBody(request.body)
      if (!parsed.ok) return reply.status(400).send(errorBody(400, parsed.message))
      const result = await submitReply(store, request.authUser, request.params.reviewId, parsed.value, deps.now())
      if (!result.ok) return reply.status(result.status).send(errorBody(result.status, result.message))
      return reply.status(201).send(toSubmissionJson(result.submission))
    })

    app.get<{ Querystring: { status: InquiryStatus | 'all' } }>('/outfitter/inquiries', {
      schema: {
        tags: ['me'],
        summary: 'Inquiries sent to my listing',
        querystring: {
          type: 'object',
          properties: { status: { type: 'string', enum: [...INQUIRY_STATUSES, 'all'], default: 'all' } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              inquiries: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    hunterName: nullableString,
                    hunterEmail: { type: 'string' },
                    hunterPhone: nullableString,
                    preferredDates: nullableString,
                    partySize: { type: 'integer', nullable: true },
                    message: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                  },
                },
              },
              unread: { type: 'integer' },
            },
          },
        },
      },
    }, async (request, reply) => {
      const listing = await store.findByOwner(request.authUser.id)
      if (!listing) return reply.status(404).send(errorBody(404, NO_LISTING))
      const all = await store.listInquiries(listing.id, request.authUser.id, 'all')
      const { status } = request.query
      return {
        inquiries: all
          .filter(i => status === 'all' || i.status === status)
          .map(i => ({
            id: i.id,
            hunterName: i.hunterName,
            hunterEmail: i.hunterEmail,
            hunterPhone: i.hunterPhone,
            preferredDates: i.preferredDates,
            partySize: i.partySize,
            message: i.message,
            status: i.status,
            createdAt: i.createdAt.toISOString(),
          })),
        unread: all.filter(i => i.status === 'new').length,
      }
    })

    app.post<{ Params: { id: string } }>('/outfitter/inquiries/:id/status', {
      schema: {
        tags: ['me'],
        summary: 'Mark an inquiry new, read or archived',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: { id: { type: 'string' }, status: { type: 'string' } },
          },
        },
      },
    }, async (request, reply) => {
      const status = (request.body as { status?: unknown } | null | undefined)?.status
      if (typeof status !== 'string' || !(INQUIRY_STATUSES as readonly string[]).includes(status)) {
        return reply.status(400).send(errorBody(400, 'status must be new, read or archived'))
      }
      const listing = await store.findByOwner(request.authUser.id)
      const { id } = request.params
      const changed = listing && UUID_RE.test(id) ? await store.setInquiryStatus(id.toLowerCase(), listing.id, request.authUser.id, status as InquiryStatus) : false
      if (!changed) return reply.status(404).send(errorBody(404, 'Inquiry not found'))
      return { id: id.toLowerCase(), status }
    })
  }
}

// Built at registration time, not import time, so ADMIN_USER_IDS from .env (loaded by index.ts) is seen.
export const meRoutes: FastifyPluginAsync = async (app, opts) => {
  await buildMeRoutes({
    store: drizzleOutfitterStore,
    verifyUser: verifyAccessTokenUser,
    adminIds: parseAdminIds(process.env.ADMIN_USER_IDS),
    now: () => new Date(),
  })(app, opts)
}
