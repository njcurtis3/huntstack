import { describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { createDrizzleFieldReportStore, roundToCell, toPublic, validateReport, type NewReport } from './field-reports.js'

const now = new Date('2026-11-07T12:00:00Z')
const base = {
  lat: 35.123456,
  lng: -101.987654,
  birdGroup: 'duck',
  speciesSlug: 'mallard',
  countBucket: '10-50',
  observedAt: '2026-11-07T11:00:00Z',
}

describe('roundToCell', () => {
  it('snaps to the centre of a 0.05-degree cell', () => {
    expect(roundToCell(35.123456)).toBe(35.125)
    expect(roundToCell(-101.987654)).toBe(-101.975)
  })

  it('gives every point in a cell the same value', () => {
    expect(roundToCell(35.1001)).toBe(roundToCell(35.1499))
  })
})

describe('validateReport', () => {
  it('accepts a good report and computes the cell', () => {
    const r = validateReport(base, now)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.latCell).toBe(35.125)
      expect(r.value.lngCell).toBe(-101.975)
    }
  })

  it('accepts not-sure (null species) and a time 4 minutes ahead', () => {
    expect(validateReport({ ...base, speciesSlug: null, observedAt: '2026-11-07T12:04:00Z' }, now).ok).toBe(true)
  })

  it.each([
    ['future by more than 5 minutes', { observedAt: '2026-11-07T12:06:00Z' }],
    ['older than 72 hours', { observedAt: '2026-11-04T11:59:00Z' }],
    ['no offset', { observedAt: '2026-11-07T11:00:00' }],
    ['unknown slug', { speciesSlug: 'dodo' }],
    ['slug in the wrong group', { speciesSlug: 'snow-goose' }],
    ['countExact outside bucket', { countExact: 5 }],
    ['countExact 250001', { countBucket: '200+', countExact: 250001 }],
    ['outside US bbox', { lat: 51.5, lng: -0.12 }],
    ['extra property', { userId: 'x' }],
  ])('rejects %s', (_name, patch) => {
    expect(validateReport({ ...base, ...patch }, now).ok).toBe(false)
  })
})

describe('toPublic', () => {
  it('labels not-sure reports and exposes only cell values', () => {
    const p = toPublic({
      id: 'a', latCell: 35.125, lngCell: -101.975, birdGroup: 'goose', speciesSlug: null,
      countBucket: '1-10', countExact: null, activity: null, observedAt: now,
    })
    expect(p.speciesLabel).toBe('Geese (not sure)')
    expect(p.lat).toBe(35.125)
  })
})

// Runs the real Drizzle store SQL against a stand-in pg-proxy driver (no database, no network) and
// records every statement and bound parameter. postgres-js cannot bind a Date that drizzle left
// unserialized (ERR_INVALID_ARG_TYPE on every real POST), so no parameter may be a Date.
describe('drizzleFieldReportStore', () => {
  const report: NewReport = {
    userId: '00000000-0000-0000-0000-000000000001', birdGroup: 'duck', speciesSlug: 'mallard',
    countBucket: '10-50', countExact: 25, activity: 'flying', lat: 35.123456, lng: -101.987654,
    latCell: 35.125, lngCell: -101.975, observedAt: new Date('2026-11-07T11:00:00Z'),
  }
  const limits = { now, perHour: 10, perDay: 30 }

  function fakeDb(counts: [number, number]) {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const db = drizzle(async (query, params) => {
      calls.push({ sql: query, params })
      if (/^insert/i.test(query)) return { rows: [['id-1', 35.125, -101.975, 'duck', 'mallard', '10-50', 25, 'flying', '2026-11-07T11:00:00.000Z']] }
      if (/count\(\*\)/i.test(query)) return { rows: [counts] }
      return { rows: [] }
    })
    // The proxy driver has no transactions; the store only needs the callback run on this connection.
    const store = createDrizzleFieldReportStore(() => ({ transaction: async (fn: (tx: unknown) => unknown) => fn(db) }) as never)
    return { store, calls }
  }

  it('binds no Date objects, takes the per-user lock first, and inserts under the caps', async () => {
    const { store, calls } = fakeDb([0, 0])
    const result = await store.insertIfUnderLimits(report, limits)
    expect(result.limited).toBe(false)
    expect(calls[0].sql).toMatch(/pg_advisory_xact_lock/)
    expect(calls.map(c => c.sql.split(' ')[0].toLowerCase())).toEqual(['select', 'select', 'insert'])
    for (const c of calls) {
      for (const p of c.params) expect(p instanceof Date, c.sql).toBe(false)
    }
    // exact point stays out of the returned row
    expect(JSON.stringify(result)).not.toContain('35.123456')
  })

  it('returns limited and does not insert at either cap', async () => {
    for (const counts of [[10, 10], [30, 5]] as Array<[number, number]>) {
      const { store, calls } = fakeDb(counts)
      expect((await store.insertIfUnderLimits(report, limits)).limited).toBe(true)
      expect(calls.some(c => /^insert/i.test(c.sql))).toBe(false)
    }
  })
})
