import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildFieldReportsRoutes } from './field-reports.js'
import type { FieldReportStore, NewReport, StoredPublicRow } from '../lib/field-reports.js'
import { AuthUnconfiguredError } from '../lib/supabase-auth.js'

const NOW = new Date('2026-11-07T12:00:00Z')
const EXACT_LAT = 35.123456
const EXACT_LNG = -101.987654
const PUBLIC_KEYS = ['activity', 'birdGroup', 'countBucket', 'countExact', 'id', 'lat', 'lng', 'observedAt', 'speciesLabel', 'speciesSlug']

interface Stored extends NewReport { id: string; createdAt: Date }

// The in-memory store keeps the exact point (like the real table) and hands back cell columns only.
// It also returns user_id and lat/lng on purpose from listSince to prove the response schema strips them.
function memoryStore() {
  const rows: Stored[] = []
  const store: FieldReportStore = {
    // No await between the count and the push, so this is atomic per call like the real store's lock.
    async insertIfUnderLimits(r, { now, perHour, perDay }) {
      const mine = rows.filter(x => x.userId === r.userId)
      const hour = mine.filter(x => x.createdAt.getTime() >= now.getTime() - 3600_000).length
      const day = mine.filter(x => x.createdAt.getTime() >= now.getTime() - 86400_000).length
      if (hour >= perHour || day >= perDay) return { limited: true }
      const row: Stored = { ...r, id: `id-${rows.length + 1}`, createdAt: NOW }
      rows.push(row)
      return { limited: false, row: cellOnly(row) }
    },
    async listSince(since) {
      return rows.filter(r => r.observedAt >= since).map(r => ({ ...cellOnly(r), lat: r.lat, lng: r.lng, userId: r.userId }) as StoredPublicRow)
    },
  }
  return { rows, store }
}

function cellOnly(r: Stored): StoredPublicRow {
  return {
    id: r.id, latCell: r.latCell, lngCell: r.lngCell, birdGroup: r.birdGroup, speciesSlug: r.speciesSlug,
    countBucket: r.countBucket, countExact: r.countExact, activity: r.activity, observedAt: r.observedAt,
  }
}

async function build(verifyToken: (t: string) => Promise<string | null>) {
  const { rows, store } = memoryStore()
  const app = Fastify()
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
  await app.register(buildFieldReportsRoutes({ store, verifyToken, now: () => NOW }), { prefix: '/api/field-reports' })
  return { app, rows }
}

const good = {
  lat: EXACT_LAT,
  lng: EXACT_LNG,
  birdGroup: 'duck',
  speciesSlug: 'mallard',
  countBucket: '10-50',
  countExact: 25,
  activity: 'flying',
  observedAt: '2026-11-07T11:30:00Z',
}
const auth = { authorization: 'Bearer good-token' }
const fakeVerify = async (t: string) => (t === 'good-token' ? 'user-1' : null)

describe('field-reports routes', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build(fakeVerify) })

  const post = (payload: unknown, headers: Record<string, string> = auth) =>
    ctx.app.inject({ method: 'POST', url: '/api/field-reports', headers, payload: payload as object })

  it('POST 201 returns the rounded public shape', async () => {
    const res = await post(good)
    expect(res.statusCode).toBe(201)
    expect(res.body).not.toContain('35.123456')
    expect(res.body).not.toContain('-101.987654')
    const body = res.json()
    expect(Object.keys(body).sort()).toEqual(PUBLIC_KEYS)
    expect(body.lat).toBe(35.125)
    expect(body.lng).toBe(-101.975)
    expect(body.speciesLabel).toBe('Mallard')
  })

  it('GET never exposes the exact point or user id', async () => {
    await post(good)
    const res = await ctx.app.inject({ method: 'GET', url: '/api/field-reports' })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('35.123456')
    expect(res.body).not.toContain('-101.987654')
    expect(res.body).not.toMatch(/user_?id/i)
    const body = res.json()
    expect(body.label).toBe('Hunter reports, unverified')
    expect(body.days).toBe(7)
    expect(body.reports).toHaveLength(1)
    expect(Object.keys(body.reports[0]).sort()).toEqual(PUBLIC_KEYS)
    expect(body.reports[0].lat).toBe(35.125)
  })

  it('401 without a header and with a bad token', async () => {
    expect((await post(good, {})).statusCode).toBe(401)
    expect((await post(good, { authorization: 'Bearer nope' })).statusCode).toBe(401)
  })

  it('503 when the verifier is not configured', async () => {
    const c = await build(async () => { throw new AuthUnconfiguredError() })
    const res = await c.app.inject({ method: 'POST', url: '/api/field-reports', headers: auth, payload: good })
    expect(res.statusCode).toBe(503)
  })

  it.each([
    ['future', { observedAt: '2026-11-07T12:06:00Z' }],
    ['older than 72h', { observedAt: '2026-11-04T11:00:00Z' }],
    ['unknown slug', { speciesSlug: 'dodo' }],
    ['slug/group mismatch', { speciesSlug: 'snow-goose' }],
    ['countExact outside bucket', { countExact: 5 }],
    ['countExact 250001', { countBucket: '200+', countExact: 250001 }],
    ['outside US', { lat: 48.85, lng: 2.35 }],
    ['extra property', { userId: 'someone-else' }],
  ])('400 for %s', async (_n, patch) => {
    const res = await post({ ...good, ...patch })
    expect(res.statusCode).toBe(400)
    expect(ctx.rows).toHaveLength(0)
  })

  it('429 at the 11th report in an hour for one user, not for another', async () => {
    for (let i = 0; i < 10; i++) expect((await post(good)).statusCode).toBe(201)
    expect((await post(good)).statusCode).toBe(429)
    expect(ctx.rows).toHaveLength(10)
    const other = await build(async () => 'user-2')
    ctx.rows.forEach(r => other.rows.push(r))
    expect((await other.app.inject({ method: 'POST', url: '/api/field-reports', headers: auth, payload: good })).statusCode).toBe(201)
  })

  it('concurrent POSTs from one user store exactly 10 and 429 the rest', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => post(good)))
    expect(results.filter(r => r.statusCode === 201)).toHaveLength(10)
    expect(results.filter(r => r.statusCode === 429)).toHaveLength(15)
    expect(ctx.rows).toHaveLength(10)
  })

  it('GET days: default 7, 0 and 8 rejected', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/field-reports' })).json().days).toBe(7)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/field-reports?days=3' })).json().days).toBe(3)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/field-reports?days=0' })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/field-reports?days=8' })).statusCode).toBe(400)
  })
})
