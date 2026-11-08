import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildAdminRoutes } from './admin.js'
import { buildMeRoutes } from './me.js'
import { createMemoryOutfitterStore, type OutfitterRecord } from '../lib/outfitter-store.js'
import { parseAdminIds, type AuthUser } from '../lib/auth-guard.js'
import { AuthUnconfiguredError } from '../lib/supabase-auth.js'

const NOW = new Date('2026-11-07T12:00:00Z')
// every submission in these tests is written at NOW, so this is the version the admin saw
const SEEN = NOW.toISOString()
const ADMIN = '11111111-1111-4111-8111-111111111111'
const OWNER = '22222222-2222-4222-8222-222222222222'
const NEWBIE = '44444444-4444-4444-8444-444444444444'
const RIVAL = '55555555-5555-4555-8555-555555555555'
const CAMP = '90000000-0000-4000-8000-000000000001'
const OWNED = '90000000-0000-4000-8000-000000000002'

const users: Record<string, AuthUser> = {
  admin: { id: ADMIN, email: 'admin@example.com' },
  owner: { id: OWNER, email: 'owner@example.com' },
  newbie: { id: NEWBIE, email: 'newbie@example.com' },
  rival: { id: RIVAL, email: 'rival@example.com' },
}
const verifyUser = async (t: string) => {
  if (t === 'boom') throw new AuthUnconfiguredError()
  return users[t] ?? null
}
const as = (t: string) => ({ authorization: `Bearer ${t}` })

const listing = (over: Partial<OutfitterRecord>): OutfitterRecord => ({
  id: CAMP, name: 'Unclaimed Camp', slug: 'unclaimed-camp', city: 'Lubbock', state: 'TX', statesServed: ['TX'], speciesOffered: ['Mallard'],
  huntTypes: ['guided'], priceRange: '$$', priceNote: null, rating: null, reviewCount: 0, description: 'A long enough description.',
  website: null, phone: null, isVerified: false, isActive: true, ownerId: null, legacyId: null, ...over,
})

const newListing = {
  name: 'Prairie Wing Outfitters', city: 'Amarillo', state: 'TX', statesServed: ['TX'], huntTypes: ['guided'], speciesOffered: ['Mallard'],
  priceRange: '$$', priceNote: null, description: 'Guided waterfowl hunts across the Panhandle playas.', phone: null, website: null,
}
const claimOf = (outfitterId: string) => ({ kind: 'claim', claim: { outfitterId, role: 'Owner', contactPhone: null, contactEmail: null, note: '' } })

async function build(adminIds: ReadonlySet<string> = new Set([ADMIN]), verify = verifyUser, now: () => Date = () => NOW) {
  const store = createMemoryOutfitterStore({ listings: [listing({}), listing({ id: OWNED, name: 'Owned Camp', slug: 'owned-camp', ownerId: OWNER })] })
  const app = Fastify()
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
  await app.register(buildAdminRoutes({ store, verifyUser: verify, adminIds, now }), { prefix: '/api/admin' })
  await app.register(buildMeRoutes({ store, verifyUser: verify, adminIds, now }), { prefix: '/api/me' })
  return { app, store }
}

describe('/api/admin authorization', () => {
  const routes: Array<['GET' | 'POST', string]> = [
    ['GET', '/submissions'], ['POST', '/submissions/x/approve'], ['POST', '/submissions/x/reject'],
    ['GET', '/outfitters'], ['POST', '/outfitters/x/active'], ['POST', '/outfitters/x/release'],
  ]

  it('401 with no header or a bad token, on every route', async () => {
    const { app } = await build()
    for (const [method, url] of routes) {
      expect((await app.inject({ method, url: `/api/admin${url}` })).statusCode).toBe(401)
      expect((await app.inject({ method, url: `/api/admin${url}`, headers: as('nope') })).statusCode).toBe(401)
    }
  })

  it('503 when the verifier is not configured', async () => {
    const { app } = await build()
    expect((await app.inject({ method: 'GET', url: '/api/admin/submissions', headers: as('boom') })).statusCode).toBe(503)
  })

  it('403 for a valid non-admin, on every route', async () => {
    const { app } = await build()
    for (const [method, url] of routes) {
      const res = await app.inject({ method, url: `/api/admin${url}`, headers: as('owner'), payload: method === 'POST' ? {} : undefined })
      expect(res.statusCode).toBe(403)
    }
  })

  it('ADMIN_USER_IDS unset: 403 even for the former admin id', async () => {
    const { app } = await build(parseAdminIds(undefined))
    expect((await app.inject({ method: 'GET', url: '/api/admin/submissions', headers: as('admin') })).statusCode).toBe(403)
  })

  it('an admin id gets 200', async () => {
    const { app } = await build()
    expect((await app.inject({ method: 'GET', url: '/api/admin/submissions', headers: as('admin') })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/admin/outfitters', headers: as('admin') })).statusCode).toBe(200)
  })
})

describe('/api/admin moderation', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build() })
  const admin = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    ctx.app.inject({ method, url: `/api/admin${url}`, headers: as('admin'), payload: payload as object | undefined })
  const submit = async (token: string, body: unknown) => (await ctx.app.inject({ method: 'POST', url: '/api/me/outfitter/submissions', headers: as(token), payload: body as object })).json()

  it('lists pending oldest first with the current listing, submitter email and user id', async () => {
    const claim = await submit('newbie', claimOf(CAMP))
    const edit = await submit('owner', { kind: 'edit', listing: { ...newListing, name: 'Owned Camp Two' } })
    const { submissions } = (await admin('GET', '/submissions')).json()
    expect(submissions.map((s: { id: string }) => s.id).sort()).toEqual([claim.id, edit.id].sort())
    const e = submissions.find((s: { id: string }) => s.id === edit.id)
    expect(e.submitterEmail).toBe('owner@example.com')
    expect(e.userId).toBe(OWNER)
    expect(e.current.name).toBe('Owned Camp')
    expect(e.current.ownerId).toBe(OWNER)
    expect(e.payload.name).toBe('Owned Camp Two')
  })

  it('approving a new listing creates a live, owned listing and records the reviewer', async () => {
    const sub = await submit('newbie', { kind: 'new_listing', listing: newListing })
    const res = await admin('POST', `/submissions/${sub.id}/approve`, { markVerified: true, expectedUpdatedAt: SEEN })
    expect(res.statusCode).toBe(200)
    const { submission, outfitter } = res.json()
    expect(outfitter.slug).toBe('prairie-wing-outfitters')
    expect(outfitter.isVerified).toBe(true)
    expect(outfitter.ownerId).toBe(NEWBIE)
    expect(submission.status).toBe('approved')
    expect(submission.outfitterId).toBe(outfitter.id)
    const stored = ctx.store.state.submissions.find(s => s.id === sub.id)!
    expect(stored.reviewedBy).toBe(ADMIN)
    expect(stored.reviewedAt).toEqual(NOW)
  })

  it('approving a claim sets the owner; markVerified defaults to false', async () => {
    const sub = await submit('newbie', claimOf(CAMP))
    const res = await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: SEEN })
    expect(res.statusCode).toBe(200)
    expect(res.json().outfitter.ownerId).toBe(NEWBIE)
    expect(res.json().outfitter.isVerified).toBe(false)
  })

  it('approving a claim when owner_id is already set is 409 with no change', async () => {
    const sub = await submit('newbie', claimOf(CAMP))
    ctx.store.state.listings.find(l => l.id === CAMP)!.ownerId = RIVAL
    const res = await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: SEEN })
    expect(res.statusCode).toBe(409)
    expect(ctx.store.state.listings.find(l => l.id === CAMP)!.ownerId).toBe(RIVAL)
    expect(ctx.store.state.submissions.find(s => s.id === sub.id)!.status).toBe('pending')
  })

  it('a second approve or a reject of a decided submission is 409', async () => {
    const sub = await submit('newbie', claimOf(CAMP))
    expect((await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: SEEN })).statusCode).toBe(200)
    expect((await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: SEEN })).statusCode).toBe(409)
    expect((await admin('POST', `/submissions/${sub.id}/reject`, { reason: 'too late' })).statusCode).toBe(409)
  })

  it('concurrent approvals of one submission apply once', async () => {
    const sub = await submit('newbie', claimOf(CAMP))
    const results = await Promise.all([admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: SEEN }), admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: SEEN })])
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409])
  })

  it('reject needs a 3..500 character reason; unknown submission is 404', async () => {
    const sub = await submit('newbie', claimOf(CAMP))
    expect((await admin('POST', `/submissions/${sub.id}/reject`)).statusCode).toBe(400)
    expect((await admin('POST', `/submissions/${sub.id}/reject`, { reason: 'x'.repeat(501) })).statusCode).toBe(400)
    expect((await admin('POST', '/submissions/90000000-0000-4000-8000-0000000000ff/reject', { reason: 'nope nope' })).statusCode).toBe(404)
    const ok = await admin('POST', `/submissions/${sub.id}/reject`, { reason: 'Could not verify ownership' })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().submission.rejectReason).toBe('Could not verify ownership')
    expect(ctx.store.state.listings.find(l => l.id === CAMP)!.ownerId).toBeNull()
    const decided = (await admin('GET', '/submissions?status=decided')).json().submissions
    expect(decided).toHaveLength(1)
  })

  it('deactivate hides a listing from the public; release clears the owner', async () => {
    const off = await admin('POST', `/outfitters/${OWNED}/active`, { isActive: false })
    expect(off.statusCode).toBe(200)
    expect(off.json().outfitter.isActive).toBe(false)
    expect((await admin('POST', `/outfitters/${OWNED}/active`, { isActive: 'no' })).statusCode).toBe(400)
    expect((await admin('GET', '/outfitters')).json().outfitters).toHaveLength(2)
    const released = await admin('POST', `/outfitters/${OWNED}/release`)
    expect(released.json().outfitter.ownerId).toBeNull()
    expect((await admin('POST', '/outfitters/nope/release')).statusCode).toBe(404)
  })
})

describe('/api/admin approve applies only the version the admin saw', () => {
  const STALE = 'This request changed after you opened it. Review it again.'
  let clock: Date
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => {
    clock = NOW
    ctx = await build(new Set([ADMIN]), verifyUser, () => clock)
  })
  const admin = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    ctx.app.inject({ method, url: `/api/admin${url}`, headers: as('admin'), payload: payload as object | undefined })
  const submit = async (token: string, url: string, body: unknown) =>
    (await ctx.app.inject({ method: 'POST', url: `/api/me${url}`, headers: as(token), payload: body as object })).json()
  const queued = async (id: string) =>
    (await admin('GET', '/submissions')).json().submissions.find((s: { id: string }) => s.id === id)

  it('the queue carries updatedAt for each submission', async () => {
    const sub = await submit('owner', '/outfitter/submissions', { kind: 'edit', listing: { ...newListing, name: 'Owned Camp Two' } })
    expect((await queued(sub.id)).updatedAt).toBe(NOW.toISOString())
  })

  it('an edit re-saved after the admin loaded it: 409, nothing applied, still pending', async () => {
    const sub = await submit('owner', '/outfitter/submissions', { kind: 'edit', listing: { ...newListing, name: 'What The Admin Saw' } })
    const seen = (await queued(sub.id)).updatedAt
    clock = new Date(NOW.getTime() + 60_000)
    await submit('owner', '/outfitter/submissions', { kind: 'edit', listing: { ...newListing, name: 'Swapped In Later' } })

    const res = await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: seen })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: true, statusCode: 409, message: STALE })
    expect(ctx.store.state.listings.find(l => l.id === OWNED)!.name).toBe('Owned Camp')
    const stored = ctx.store.state.submissions.find(s => s.id === sub.id)!
    expect(stored.status).toBe('pending')
    expect(stored.reviewedBy).toBeNull()

    // the admin reloads, sees the new version, and approves that
    const fresh = await queued(sub.id)
    expect(fresh.payload.name).toBe('Swapped In Later')
    const ok = await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: fresh.updatedAt })
    expect(ok.statusCode).toBe(200)
    expect(ctx.store.state.listings.find(l => l.id === OWNED)!.name).toBe('Swapped In Later')
  })

  it('a review reply re-saved after the admin loaded it: 409 and no reply published', async () => {
    const reviewId = '60000000-0000-4000-8000-0000000000aa'
    ctx.store.state.reviews.push({ id: reviewId, outfitterId: OWNED, rating: 5, title: null, content: null, huntDate: null, createdAt: NOW })
    const sub = await submit('owner', `/outfitter/reviews/${reviewId}/reply`, { body: 'Thanks for coming out' })
    const seen = (await queued(sub.id)).updatedAt
    clock = new Date(NOW.getTime() + 1)
    await submit('owner', `/outfitter/reviews/${reviewId}/reply`, { body: 'Something else entirely' })
    expect((await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: seen })).statusCode).toBe(409)
    expect(ctx.store.state.replies).toHaveLength(0)
  })

  it('the matching version is 200 and applied', async () => {
    const sub = await submit('owner', '/outfitter/submissions', { kind: 'edit', listing: { ...newListing, name: 'Owned Camp Two' } })
    const res = await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: (await queued(sub.id)).updatedAt })
    expect(res.statusCode).toBe(200)
    expect(res.json().submission.status).toBe('approved')
    expect(ctx.store.state.listings.find(l => l.id === OWNED)!.name).toBe('Owned Camp Two')
  })

  it('a missing or unparseable expectedUpdatedAt is 400 and nothing is applied', async () => {
    const sub = await submit('newbie', '/outfitter/submissions', claimOf(CAMP))
    expect((await admin('POST', `/submissions/${sub.id}/approve`, {})).statusCode).toBe(400)
    expect((await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: 'yesterday' })).statusCode).toBe(400)
    expect((await admin('POST', `/submissions/${sub.id}/approve`, { expectedUpdatedAt: 12 })).statusCode).toBe(400)
    expect(ctx.store.state.listings.find(l => l.id === CAMP)!.ownerId).toBeNull()
    expect(ctx.store.state.submissions.find(s => s.id === sub.id)!.status).toBe('pending')
  })
})
