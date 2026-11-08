import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildMeRoutes } from './me.js'
import { buildAdminRoutes } from './admin.js'
import { buildOutfittersRoutes } from './outfitters.js'
import { createMemoryOutfitterStore, type OutfitterRecord } from '../lib/outfitter-store.js'
import { createViewCounter } from '../lib/outfitter-views.js'
import { parseAdminIds, type AuthUser } from '../lib/auth-guard.js'

const NOW = new Date('2026-11-07T12:00:00Z')
const ADMIN = '11111111-1111-4111-8111-111111111111'
const OWNER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const NEWBIE = '44444444-4444-4444-8444-444444444444'

const users: Record<string, AuthUser> = {
  admin: { id: ADMIN, email: 'admin@example.com' },
  owner: { id: OWNER, email: 'owner@example.com' },
  other: { id: OTHER, email: 'other@example.com' },
  newbie: { id: NEWBIE, email: 'newbie@example.com' },
}
const verifyUser = async (t: string) => users[t] ?? null
const as = (t: string) => ({ authorization: `Bearer ${t}`, 'user-agent': 'Mozilla/5.0 Firefox/130' })

const LISTING_ID = '50000000-0000-4000-8000-000000000001'
const OTHER_LISTING_ID = '50000000-0000-4000-8000-000000000002'
const REVIEW_ID = '60000000-0000-4000-8000-000000000001'
const FOREIGN_REVIEW_ID = '60000000-0000-4000-8000-000000000002'

function listing(over: Partial<OutfitterRecord>): OutfitterRecord {
  return {
    id: LISTING_ID, name: 'Old Name Outfitters', slug: 'old-name', city: 'Lubbock', state: 'TX', statesServed: ['TX'],
    speciesOffered: ['Mallard'], huntTypes: ['guided'], priceRange: '$$', priceNote: null, rating: null, reviewCount: 0,
    description: 'The old description of this outfitter.', website: null, phone: null, isVerified: false, isActive: true,
    ownerId: OWNER, legacyId: null, ...over,
  }
}

const edit = {
  name: 'New Name Outfitters', city: 'Lubbock', state: 'TX', statesServed: ['TX'], huntTypes: ['guided'], speciesOffered: ['Mallard'],
  priceRange: '$$', priceNote: null, description: 'The brand new description of this outfitter.', phone: null, website: null,
}

async function build(adminIds: ReadonlySet<string> = new Set([ADMIN])) {
  const store = createMemoryOutfitterStore({
    listings: [
      listing({}),
      listing({ id: OTHER_LISTING_ID, name: 'Unclaimed Camp', slug: 'unclaimed', ownerId: null, legacyId: 'tx-05' }),
    ],
    reviews: [
      { id: REVIEW_ID, outfitterId: LISTING_ID, rating: 4, title: 'Good', content: 'Nice hunt', huntDate: null, createdAt: new Date('2026-10-01T00:00:00Z') },
      { id: FOREIGN_REVIEW_ID, outfitterId: OTHER_LISTING_ID, rating: 2, title: null, content: null, huntDate: null, createdAt: new Date('2026-10-02T00:00:00Z') },
    ],
  })
  const app = Fastify()
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
  await app.register(buildMeRoutes({ store, verifyUser, adminIds, now: () => NOW }), { prefix: '/api/me' })
  await app.register(buildAdminRoutes({ store, verifyUser, adminIds, now: () => NOW }), { prefix: '/api/admin' })
  await app.register(
    buildOutfittersRoutes({ store, verifyUser, now: () => NOW, viewCounter: createViewCounter({ store, now: () => NOW }) }),
    { prefix: '/api/outfitters' },
  )
  return { app, store }
}

describe('/api/me', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build() })
  const call = (method: 'GET' | 'POST', url: string, token: string | null, payload?: unknown) =>
    ctx.app.inject({ method, url: `/api/me${url}`, headers: token ? as(token) : {}, payload: payload as object | undefined })
  const publicName = async () => (await ctx.app.inject({ method: 'GET', url: `/api/outfitters/${LISTING_ID}` })).json().outfitter

  it('every route needs a signed-in user', async () => {
    for (const [m, u] of [['GET', ''], ['GET', '/outfitter'], ['POST', '/outfitter/submissions'], ['GET', '/outfitter/stats'], ['GET', '/outfitter/reviews'], ['GET', '/outfitter/inquiries']] as const) {
      expect((await call(m, u, null)).statusCode).toBe(401)
    }
  })

  it('GET / reports admin only for an allow-listed verified id', async () => {
    expect((await call('GET', '', 'owner')).json()).toEqual({ userId: OWNER, email: 'owner@example.com', isAdmin: false })
    expect((await call('GET', '', 'admin')).json().isAdmin).toBe(true)
    const none = await build(parseAdminIds(undefined))
    const res = await none.app.inject({ method: 'GET', url: '/api/me', headers: as('admin') })
    expect(res.json().isAdmin).toBe(false)
  })

  it('body fields such as isAdmin or userId change nothing', async () => {
    const asAdmin = await call('POST', '/outfitter/submissions', 'newbie', { kind: 'edit', listing: edit, isAdmin: true, userId: ADMIN })
    expect(asAdmin.statusCode).toBe(400)
    const res = await call('POST', '/outfitter/submissions', 'owner', { kind: 'edit', listing: edit, userId: ADMIN })
    expect(res.statusCode).toBe(400)
    expect(ctx.store.state.submissions).toHaveLength(0)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/submissions', headers: as('owner'), payload: { isAdmin: true } })).statusCode).toBe(403)
    expect((await call('GET', '', 'owner')).json().isAdmin).toBe(false)
  })

  it('PENDING GATE: an edit is invisible publicly until an admin approves it', async () => {
    const sub = await call('POST', '/outfitter/submissions', 'owner', { kind: 'edit', listing: edit })
    expect(sub.statusCode).toBe(201)
    expect(sub.json().status).toBe('pending')
    expect(sub.json().payload).toEqual(edit)
    const before = await publicName()
    expect(before.name).toBe('Old Name Outfitters')
    expect(before.description).toBe('The old description of this outfitter.')

    const mine = (await call('GET', '/outfitter', 'owner')).json()
    expect(mine.listing.name).toBe('Old Name Outfitters')
    expect(mine.pending.id).toBe(sub.json().id)

    const approved = await ctx.app.inject({ method: 'POST', url: `/api/admin/submissions/${sub.json().id}/approve`, headers: as('admin'), payload: {} })
    expect(approved.statusCode).toBe(200)
    const after = await publicName()
    expect(after.name).toBe('New Name Outfitters')
    expect(after.description).toBe('The brand new description of this outfitter.')
    const done = (await call('GET', '/outfitter', 'owner')).json()
    expect(done.pending).toBeNull()
    expect(done.lastDecision.status).toBe('approved')
  })

  it('a second edit while one is pending replaces the pending payload: still exactly one pending', async () => {
    const first = await call('POST', '/outfitter/submissions', 'owner', { kind: 'edit', listing: edit })
    const second = await call('POST', '/outfitter/submissions', 'owner', { kind: 'edit', listing: { ...edit, name: 'Second Name Outfitters' } })
    expect(second.statusCode).toBe(201)
    expect(second.json().id).toBe(first.json().id)
    const pending = ctx.store.state.submissions.filter(s => s.status === 'pending')
    expect(pending).toHaveLength(1)
    expect((pending[0].payload as { name: string }).name).toBe('Second Name Outfitters')
  })

  it('a rejected edit shows lastDecision with its reason and leaves the live row unchanged', async () => {
    const sub = (await call('POST', '/outfitter/submissions', 'owner', { kind: 'edit', listing: edit })).json()
    const reject = (payload?: unknown) => ctx.app.inject({ method: 'POST', url: `/api/admin/submissions/${sub.id}/reject`, headers: as('admin'), payload: payload as object })
    expect((await reject({})).statusCode).toBe(400)
    expect((await reject({ reason: 'no' })).statusCode).toBe(400)
    expect((await reject({ reason: 'Photos missing' })).statusCode).toBe(200)
    const mine = (await call('GET', '/outfitter', 'owner')).json()
    expect(mine.lastDecision.status).toBe('rejected')
    expect(mine.lastDecision.rejectReason).toBe('Photos missing')
    expect(mine.pending).toBeNull()
    expect((await publicName()).name).toBe('Old Name Outfitters')
  })

  it('a user who owns a listing cannot claim or create another: 409', async () => {
    const claim = { kind: 'claim', claim: { outfitterId: OTHER_LISTING_ID, role: 'Owner', contactPhone: null, contactEmail: null, note: '' } }
    expect((await call('POST', '/outfitter/submissions', 'owner', claim)).statusCode).toBe(409)
    expect((await call('POST', '/outfitter/submissions', 'owner', { kind: 'new_listing', listing: edit })).statusCode).toBe(409)
  })

  it('new_listing and claim 409 when the user already has a pending request; edit needs a listing', async () => {
    expect((await call('POST', '/outfitter/submissions', 'newbie', { kind: 'new_listing', listing: edit })).statusCode).toBe(201)
    expect((await call('POST', '/outfitter/submissions', 'newbie', { kind: 'new_listing', listing: edit })).statusCode).toBe(409)
    const claim = { kind: 'claim', claim: { outfitterId: OTHER_LISTING_ID, role: 'Owner', contactPhone: null, contactEmail: null, note: '' } }
    expect((await call('POST', '/outfitter/submissions', 'newbie', claim)).statusCode).toBe(409)
    expect((await call('POST', '/outfitter/submissions', 'other', { kind: 'edit', listing: edit })).statusCode).toBe(404)
  })

  it('claim: 404 unknown, 409 already claimed, 201 for an unclaimed listing', async () => {
    const claim = (outfitterId: string) => ({ kind: 'claim', claim: { outfitterId, role: 'Owner', contactPhone: null, contactEmail: null, note: '' } })
    expect((await call('POST', '/outfitter/submissions', 'newbie', claim('50000000-0000-4000-8000-0000000000ff'))).statusCode).toBe(404)
    expect((await call('POST', '/outfitter/submissions', 'newbie', claim(LISTING_ID))).statusCode).toBe(409)
    const ok = await call('POST', '/outfitter/submissions', 'newbie', claim(OTHER_LISTING_ID))
    expect(ok.statusCode).toBe(201)
    expect(ok.json().outfitterId).toBe(OTHER_LISTING_ID)
  })

  it('withdraw works on own pending only', async () => {
    const sub = (await call('POST', '/outfitter/submissions', 'owner', { kind: 'edit', listing: edit })).json()
    expect((await call('POST', `/outfitter/submissions/${sub.id}/withdraw`, 'other')).statusCode).toBe(404)
    expect((await call('POST', '/outfitter/submissions/not-a-uuid/withdraw', 'owner')).statusCode).toBe(404)
    const res = await call('POST', `/outfitter/submissions/${sub.id}/withdraw`, 'owner')
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('withdrawn')
    expect((await call('POST', `/outfitter/submissions/${sub.id}/withdraw`, 'owner')).statusCode).toBe(404)
  })

  it('stats: days 7/30/90 are zero-filled, 8 is 400, no listing is 404', async () => {
    for (const days of [7, 30, 90]) {
      const res = await call('GET', `/outfitter/stats?days=${days}`, 'owner')
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.days).toBe(days)
      expect(body.daily).toHaveLength(days)
      expect(body.daily.at(-1).day).toBe('2026-11-07')
      expect(body.totals).toEqual({ impression: 0, detail: 0, contact: 0 })
    }
    expect((await call('GET', '/outfitter/stats', 'owner')).json().days).toBe(30)
    expect((await call('GET', '/outfitter/stats?days=8', 'owner')).statusCode).toBe(400)
    expect((await call('GET', '/outfitter/stats', 'other')).statusCode).toBe(404)
  })

  it('stats totals reflect counted views', async () => {
    ctx.store.state.views.push({ outfitterId: LISTING_ID, day: '2026-11-06', kind: 'detail', count: 4 }, { outfitterId: LISTING_ID, day: '2026-11-07', kind: 'impression', count: 10 })
    const body = (await call('GET', '/outfitter/stats?days=7', 'owner')).json()
    expect(body.totals).toEqual({ impression: 10, detail: 4, contact: 0 })
  })

  it('reply to a review not on the caller listing is 404; own review creates a pending submission, hidden publicly until approved', async () => {
    expect((await call('POST', `/outfitter/reviews/${FOREIGN_REVIEW_ID}/reply`, 'owner', { body: 'Thanks' })).statusCode).toBe(404)
    expect((await call('POST', `/outfitter/reviews/${REVIEW_ID}/reply`, 'other', { body: 'Thanks' })).statusCode).toBe(404)
    expect((await call('POST', `/outfitter/reviews/${REVIEW_ID}/reply`, 'owner', { body: '' })).statusCode).toBe(400)

    const res = await call('POST', `/outfitter/reviews/${REVIEW_ID}/reply`, 'owner', { body: 'Thanks for hunting with us' })
    expect(res.statusCode).toBe(201)
    expect(res.json().kind).toBe('review_reply')
    expect(res.json().status).toBe('pending')
    expect(res.json().payload).toEqual({ body: 'Thanks for hunting with us' })

    const publicReviews = async () => (await ctx.app.inject({ method: 'GET', url: `/api/outfitters/${LISTING_ID}/reviews` })).json().reviews
    expect((await publicReviews())[0].reply).toBeNull()
    const mine = (await call('GET', '/outfitter/reviews', 'owner')).json().reviews[0]
    expect(mine.reply).toBeNull()
    expect(mine.pendingReply.body).toBe('Thanks for hunting with us')

    // a second reply replaces the pending one
    await call('POST', `/outfitter/reviews/${REVIEW_ID}/reply`, 'owner', { body: 'Edited reply' })
    expect(ctx.store.state.submissions.filter(s => s.status === 'pending')).toHaveLength(1)

    await ctx.app.inject({ method: 'POST', url: `/api/admin/submissions/${res.json().id}/approve`, headers: as('admin'), payload: {} })
    expect((await publicReviews())[0].reply.body).toBe('Edited reply')
  })

  it('inbox lists inquiries for the owner only and updates status', async () => {
    ctx.store.state.inquiries.push(
      { id: '70000000-0000-4000-8000-000000000001', outfitterId: LISTING_ID, userId: NEWBIE, hunterEmail: 'newbie@example.com', hunterName: 'Sam', hunterPhone: null, preferredDates: null, partySize: 3, message: 'Hello there, any openings?', status: 'new', createdAt: new Date('2026-11-06T00:00:00Z') },
      { id: '70000000-0000-4000-8000-000000000002', outfitterId: LISTING_ID, userId: OTHER, hunterEmail: 'other@example.com', hunterName: null, hunterPhone: null, preferredDates: null, partySize: null, message: 'Another question for you', status: 'read', createdAt: new Date('2026-11-05T00:00:00Z') },
    )
    const all = (await call('GET', '/outfitter/inquiries', 'owner')).json()
    expect(all.inquiries).toHaveLength(2)
    expect(all.unread).toBe(1)
    expect(Object.keys(all.inquiries[0]).sort()).toEqual(['createdAt', 'hunterEmail', 'hunterName', 'hunterPhone', 'id', 'message', 'partySize', 'preferredDates', 'status'])
    expect((await call('GET', '/outfitter/inquiries?status=read', 'owner')).json().inquiries).toHaveLength(1)
    expect((await call('GET', '/outfitter/inquiries?status=bogus', 'owner')).statusCode).toBe(400)
    expect((await call('GET', '/outfitter/inquiries', 'other')).statusCode).toBe(404)

    const id = '70000000-0000-4000-8000-000000000001'
    expect((await call('POST', `/outfitter/inquiries/${id}/status`, 'other', { status: 'read' })).statusCode).toBe(404)
    expect((await call('POST', `/outfitter/inquiries/${id}/status`, 'owner', { status: 'weird' })).statusCode).toBe(400)
    const ok = await call('POST', `/outfitter/inquiries/${id}/status`, 'owner', { status: 'archived' })
    expect(ok.json()).toEqual({ id, status: 'archived' })
    expect((await call('GET', '/outfitter/inquiries', 'owner')).json().unread).toBe(0)
  })

  it('429 once a user has made 20 submissions in 24 hours', async () => {
    for (let i = 0; i < 20; i++) {
      ctx.store.state.submissions.push({
        id: crypto.randomUUID(), kind: 'edit', status: 'withdrawn', userId: OWNER, submitterEmail: null, outfitterId: LISTING_ID, reviewId: null,
        payload: edit, rejectReason: null, reviewedBy: null, reviewedAt: null, createdAt: new Date(NOW.getTime() - 3600_000), updatedAt: NOW,
      })
    }
    expect((await call('POST', '/outfitter/submissions', 'owner', { kind: 'edit', listing: edit })).statusCode).toBe(429)
  })
})
