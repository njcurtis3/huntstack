import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildOutfittersRoutes } from './outfitters.js'
import { createMemoryOutfitterStore, type OutfitterRecord } from '../lib/outfitter-store.js'
import { createViewCounter } from '../lib/outfitter-views.js'
import { AuthUnconfiguredError } from '../lib/supabase-auth.js'
import type { AuthUser } from '../lib/auth-guard.js'

const NOW = new Date('2026-11-07T12:00:00Z')
const UA = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0'
const HUNTER = '66666666-6666-4666-8666-666666666666'
const OWNER = '77777777-7777-4777-8777-777777777777'

const PUBLIC_KEYS = [
  'claimed', 'city', 'description', 'huntTypes', 'id', 'isVerified', 'name', 'phone', 'priceNote', 'priceRange',
  'rating', 'reviewCount', 'slug', 'speciesOffered', 'state', 'statesServed', 'website',
].sort()

const users: Record<string, AuthUser> = {
  'hunter-token': { id: HUNTER, email: 'hunter@example.com' },
}
const verifyUser = async (t: string) => {
  if (t === 'boom') throw new AuthUnconfiguredError()
  return users[t] ?? null
}

function listing(over: Partial<OutfitterRecord>): OutfitterRecord {
  return {
    id: crypto.randomUUID(), name: 'Plain Outfitter', slug: 'plain-outfitter', city: 'Lubbock', state: 'TX', statesServed: ['TX'],
    speciesOffered: ['Mallard'], huntTypes: ['guided'], priceRange: '$$', priceNote: 'Contact for pricing', rating: null,
    reviewCount: 0, description: 'A description that is long enough.', website: 'https://example.com', phone: '(806) 555-0100',
    isVerified: true, isActive: true, ownerId: null, legacyId: null, ...over,
  }
}

async function build(initial: Parameters<typeof createMemoryOutfitterStore>[0]) {
  const store = createMemoryOutfitterStore(initial)
  const app = Fastify()
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
  await app.register(
    buildOutfittersRoutes({ store, verifyUser, now: () => NOW, viewCounter: createViewCounter({ store, now: () => NOW }) }),
    { prefix: '/api/outfitters' },
  )
  return { app, store }
}

const flush = () => new Promise<void>(r => setTimeout(r, 5))
const headers = { 'user-agent': UA }

describe('GET /api/outfitters', () => {
  const zulu = listing({ id: '10000000-0000-4000-8000-000000000001', name: 'Zulu Outfitters', slug: 'zulu', legacyId: 'tx-01', ownerId: OWNER, statesServed: ['TX', 'NM'], speciesOffered: ['Mallard', 'Snow Goose'], priceRange: '$$$' })
  const alpha = listing({ id: '10000000-0000-4000-8000-000000000002', name: 'Alpha Outfitters', slug: 'alpha', state: 'NM', statesServed: ['NM'], speciesOffered: ['Sandhill Crane'], priceRange: '$', isVerified: false })
  const bravo = listing({ id: '10000000-0000-4000-8000-000000000003', name: 'Bravo Outfitters', slug: 'bravo', city: 'Abilene', speciesOffered: ['Dove'] })
  const hidden = listing({ id: '10000000-0000-4000-8000-000000000004', name: 'Hidden Outfitters', slug: 'hidden', isActive: false })
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build({ listings: [zulu, alpha, bravo, hidden] }) })
  const get = (url: string) => ctx.app.inject({ method: 'GET', url, headers })

  it('items have exactly the contract keys: no ownerId, metadata, legacyId, isActive or contactEmail', async () => {
    const res = await get('/api/outfitters')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    for (const item of body.outfitters) expect(Object.keys(item).sort()).toEqual(PUBLIC_KEYS)
    expect(res.body).not.toMatch(/ownerId|owner_id|metadata|legacyId|isActive|contactEmail/)
    expect(res.body).not.toContain(OWNER)
    expect(res.body).not.toContain('tx-01')
  })

  it('serves only active rows, verified first then by name, with total and states', async () => {
    const body = (await get('/api/outfitters')).json()
    expect(body.outfitters.map((o: { name: string }) => o.name)).toEqual(['Bravo Outfitters', 'Zulu Outfitters', 'Alpha Outfitters'])
    expect(body.total).toBe(3)
    expect(body.states).toEqual(['NM', 'TX'])
  })

  it('claimed reflects whether the listing has an owner', async () => {
    const body = (await get('/api/outfitters')).json()
    const claimed = Object.fromEntries(body.outfitters.map((o: { slug: string; claimed: boolean }) => [o.slug, o.claimed]))
    expect(claimed).toEqual({ zulu: true, alpha: false, bravo: false })
  })

  it('state, species, priceRange and q filters behave as before', async () => {
    const names = async (qs: string) => (await get(`/api/outfitters?${qs}`)).json().outfitters.map((o: { name: string }) => o.name)
    expect(await names('state=nm')).toEqual(['Zulu Outfitters', 'Alpha Outfitters'])
    expect(await names('species=crane')).toEqual(['Alpha Outfitters'])
    expect(await names('priceRange=%24%24%24')).toEqual(['Zulu Outfitters'])
    expect(await names('q=abilene')).toEqual(['Bravo Outfitters'])
    expect(await names('q=dove&state=TX')).toEqual(['Bravo Outfitters'])
  })

  it('paginates with limit and offset, total stays the filtered count', async () => {
    const body = (await get('/api/outfitters?limit=1&offset=1')).json()
    expect(body.outfitters.map((o: { slug: string }) => o.slug)).toEqual(['zulu'])
    expect(body.total).toBe(3)
    expect((await get('/api/outfitters?limit=101')).statusCode).toBe(400)
  })

  it('counts one impression per returned item, once per viewer per day', async () => {
    await get('/api/outfitters')
    await get('/api/outfitters')
    await flush()
    const impressions = ctx.store.state.views.filter(v => v.kind === 'impression')
    expect(impressions).toHaveLength(3)
    expect(impressions.every(v => v.count === 1)).toBe(true)
    expect(impressions.some(v => v.outfitterId === hidden.id)).toBe(false)
  })

  it('does not count a bot or a request with no User-Agent', async () => {
    await ctx.app.inject({ method: 'GET', url: '/api/outfitters', headers: { 'user-agent': 'Googlebot/2.1' } })
    await ctx.app.inject({ method: 'GET', url: '/api/outfitters', headers: { 'user-agent': '' } })
    await flush()
    expect(ctx.store.state.views).toHaveLength(0)
  })

  it('a counting failure never fails the GET', async () => {
    ctx.store.addViews = async () => { throw new Error('db down') }
    const res = await get('/api/outfitters')
    expect(res.statusCode).toBe(200)
  })

  it('GET /claimable lists active listings with no owner, in a minimal shape', async () => {
    const res = await get('/api/outfitters/claimable')
    expect(res.statusCode).toBe(200)
    const list = res.json().outfitters
    expect(list.map((o: { slug: string }) => o.slug)).toEqual(['alpha', 'bravo'])
    expect(Object.keys(list[0]).sort()).toEqual(['city', 'id', 'name', 'slug', 'state'])
  })
})

describe('GET /api/outfitters/:idOrSlug', () => {
  const live = listing({ id: '20000000-0000-4000-8000-000000000001', name: 'Top Gun Outfitters', slug: 'top-gun-outfitters', legacyId: 'tx-01' })
  const off = listing({ id: '20000000-0000-4000-8000-000000000002', name: 'Off', slug: 'off', legacyId: 'tx-02', isActive: false })
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build({ listings: [live, off] }) })
  const get = (id: string) => ctx.app.inject({ method: 'GET', url: `/api/outfitters/${id}`, headers })

  it.each([
    ['uuid', live.id],
    ['slug', 'top-gun-outfitters'],
    ['legacy id', 'tx-01'],
  ])('resolves by %s', async (_n, id) => {
    const res = await get(id)
    expect(res.statusCode).toBe(200)
    const { outfitter } = res.json()
    expect(outfitter.id).toBe(live.id)
    expect(Object.keys(outfitter).sort()).toEqual(PUBLIC_KEYS)
  })

  it('404 for unknown and for inactive listings, with the standard error body', async () => {
    for (const id of ['nope', 'off', 'tx-02', off.id, '20000000-0000-4000-8000-0000000000ff']) {
      const res = await get(id)
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: true, statusCode: 404, message: 'Outfitter not found' })
    }
  })

  it('counts one detail per viewer per day', async () => {
    await get('tx-01')
    await get('top-gun-outfitters')
    await flush()
    expect(ctx.store.state.views).toEqual([{ outfitterId: live.id, day: '2026-11-07', kind: 'detail', count: 1 }])
  })
})

describe('GET /api/outfitters/:id/reviews', () => {
  const o = listing({ id: '30000000-0000-4000-8000-000000000001', slug: 'o' })
  const r1 = { id: '30000000-0000-4000-8000-0000000000a1', outfitterId: o.id, rating: 5, title: 'Great', content: 'Loved it', huntDate: null, createdAt: new Date('2026-10-01T00:00:00Z') }
  const r2 = { id: '30000000-0000-4000-8000-0000000000a2', outfitterId: o.id, rating: 3, title: null, content: null, huntDate: new Date('2026-09-01T00:00:00Z'), createdAt: new Date('2026-10-02T00:00:00Z') }

  it('shows reviews without user ids, and only approved replies', async () => {
    const ctx = await build({
      listings: [o],
      reviews: [r1, r2],
      replies: [{ reviewId: r1.id, outfitterId: o.id, body: 'Thank you!', updatedAt: new Date('2026-10-03T00:00:00Z') }],
      // a pending reply submission must not be visible
      submissions: [{
        id: crypto.randomUUID(), kind: 'review_reply', status: 'pending', userId: OWNER, submitterEmail: null, outfitterId: o.id, reviewId: r2.id,
        payload: { body: 'secret pending reply' }, rejectReason: null, reviewedBy: null, reviewedAt: null, createdAt: NOW, updatedAt: NOW,
      }],
    })
    const res = await ctx.app.inject({ method: 'GET', url: '/api/outfitters/o/reviews' })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toMatch(/userId|user_id/)
    expect(res.body).not.toContain('secret pending reply')
    const { reviews } = res.json()
    expect(reviews).toHaveLength(2)
    const byId = Object.fromEntries(reviews.map((r: { id: string }) => [r.id, r]))
    expect(Object.keys(byId[r1.id]).sort()).toEqual(['content', 'createdAt', 'huntDate', 'id', 'rating', 'reply', 'title'])
    expect(byId[r1.id].reply).toEqual({ body: 'Thank you!', updatedAt: '2026-10-03T00:00:00.000Z' })
    expect(byId[r2.id].reply).toBeNull()
    expect(byId[r2.id].huntDate).toBe('2026-09-01T00:00:00.000Z')
  })

  it('404 for an unknown outfitter', async () => {
    const ctx = await build({ listings: [o] })
    expect((await ctx.app.inject({ method: 'GET', url: '/api/outfitters/missing/reviews' })).statusCode).toBe(404)
  })
})

describe('POST /api/outfitters/:id/contact-click', () => {
  const o = listing({ id: '40000000-0000-4000-8000-000000000001', slug: 'o', legacyId: 'tx-09' })
  const off = listing({ id: '40000000-0000-4000-8000-000000000002', slug: 'off', isActive: false })
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build({ listings: [o, off] }) })
  const click = (id: string, payload: unknown = { kind: 'call' }, h: Record<string, string> = headers) =>
    ctx.app.inject({ method: 'POST', url: `/api/outfitters/${id}/contact-click`, headers: h, payload: payload as object })

  it('204 and counts one contact per viewer per day', async () => {
    expect((await click(o.id)).statusCode).toBe(204)
    expect((await click(o.id, { kind: 'website' })).statusCode).toBe(204)
    await flush()
    expect(ctx.store.state.views).toEqual([{ outfitterId: o.id, day: '2026-11-07', kind: 'contact', count: 1 }])
  })

  it('404 for an unknown or inactive listing, 400 for an unknown kind', async () => {
    expect((await click('40000000-0000-4000-8000-0000000000ff')).statusCode).toBe(404)
    expect((await click('nope')).statusCode).toBe(404)
    expect((await click(off.id)).statusCode).toBe(404)
    expect((await click(o.id, { kind: 'email' })).statusCode).toBe(400)
    await flush()
    expect(ctx.store.state.views).toHaveLength(0)
  })

  it('does not count a bot', async () => {
    expect((await click(o.id, { kind: 'call' }, { 'user-agent': 'curl/8.0' })).statusCode).toBe(204)
    await flush()
    expect(ctx.store.state.views).toHaveLength(0)
  })
})

describe('POST /api/outfitters/:id/inquiries', () => {
  const MESSAGE = 'Looking for a guided duck hunt in January, party of four.'
  const mk = (n: number, over: Partial<OutfitterRecord> = {}) => listing({
    id: `50000000-0000-4000-8000-00000000000${n}`, slug: `o${n}`, name: `Outfitter ${n}`, ownerId: `88888888-8888-4888-8888-88888888888${n}`, ...over,
  })
  const auth = { authorization: 'Bearer hunter-token', ...headers }
  let ctx: Awaited<ReturnType<typeof build>>
  const send = (id: string, payload: unknown, h: Record<string, string> = auth) =>
    ctx.app.inject({ method: 'POST', url: `/api/outfitters/${id}/inquiries`, headers: h, payload: payload as object })

  beforeEach(async () => {
    ctx = await build({ listings: [mk(1), mk(2), mk(3), mk(4), mk(5), mk(6), mk(7, { ownerId: null, slug: 'unclaimed' }), mk(8, { isActive: false })] })
  })

  it('401 without a token or with a bad one, 503 when auth is not configured', async () => {
    expect((await send('o1', { message: MESSAGE }, headers)).statusCode).toBe(401)
    expect((await send('o1', { message: MESSAGE }, { authorization: 'Bearer nope' })).statusCode).toBe(401)
    expect((await send('o1', { message: MESSAGE }, { authorization: 'Bearer boom' })).statusCode).toBe(503)
    expect(ctx.store.state.inquiries).toHaveLength(0)
  })

  it('201 stores the inquiry with the verified token email, never a body-supplied one', async () => {
    const res = await send('o1', { message: MESSAGE, name: 'Sam', partySize: 4, hunterEmail: 'evil@example.com', userId: 'x' })
    expect(res.statusCode).toBe(400) // unknown properties are rejected outright
    const ok = await send('o1', { message: MESSAGE, name: 'Sam', phone: '(806) 555-0111', preferredDates: 'Jan 10-12', partySize: 4 })
    expect(ok.statusCode).toBe(201)
    expect(Object.keys(ok.json()).sort()).toEqual(['createdAt', 'id'])
    expect(ctx.store.state.inquiries).toHaveLength(1)
    const row = ctx.store.state.inquiries[0]
    expect(row.hunterEmail).toBe('hunter@example.com')
    expect(row.userId).toBe(HUNTER)
    expect(row.status).toBe('new')
  })

  it('409 for an unclaimed listing, 404 for unknown or inactive', async () => {
    const unclaimed = await send('unclaimed', { message: MESSAGE })
    expect(unclaimed.statusCode).toBe(409)
    expect(unclaimed.json().message).toBe('This outfitter has not claimed their listing yet')
    expect((await send('missing', { message: MESSAGE })).statusCode).toBe(404)
    expect((await send('o8', { message: MESSAGE })).statusCode).toBe(404)
    expect(ctx.store.state.inquiries).toHaveLength(0)
  })

  it('400 for a 9-character message', async () => {
    const res = await send('o1', { message: '123456789' })
    expect(res.statusCode).toBe(400)
    expect(ctx.store.state.inquiries).toHaveLength(0)
  })

  it('429 on the 6th inquiry in 24 hours by one user', async () => {
    for (const slug of ['o1', 'o2', 'o3', 'o4', 'o5']) expect((await send(slug, { message: MESSAGE })).statusCode).toBe(201)
    const sixth = await send('o6', { message: MESSAGE })
    expect(sixth.statusCode).toBe(429)
    expect(sixth.json().message).toBe('You can send 5 inquiries a day. Please try again later.')
    expect(ctx.store.state.inquiries).toHaveLength(5)
  })

  it('429 on a third inquiry to the same outfitter within a week', async () => {
    expect((await send('o1', { message: MESSAGE })).statusCode).toBe(201)
    expect((await send('o1', { message: MESSAGE })).statusCode).toBe(201)
    expect((await send('o1', { message: MESSAGE })).statusCode).toBe(429)
  })

  it('concurrent sends from one user cannot exceed the daily cap', async () => {
    const slugs = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6']
    const results = await Promise.all(slugs.map(s => send(s, { message: MESSAGE })))
    expect(results.filter(r => r.statusCode === 201)).toHaveLength(5)
    expect(results.filter(r => r.statusCode === 429)).toHaveLength(1)
  })
})
