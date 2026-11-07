import { describe, expect, it } from 'vitest'
import { roundToCell, toPublic, validateReport } from './field-reports.js'

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
