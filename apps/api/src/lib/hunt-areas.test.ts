import { describe, expect, it } from 'vitest'
import type { Place } from '../data/places.js'
import type { PublicLand } from '../data/public-lands.js'
import {
  clusterPoints, directionFrom, distanceKm, isSightingsOnly, nameArea, publicLandsNear, sameUnit, scoreArea, summarizeArea, type AreaPoint,
} from './hunt-areas.js'

function pt(id: string, lat: number, lng: number, birds: number, extra: Partial<AreaPoint> = {}): AreaPoint {
  return {
    kind: 'survey', id, name: id, state: 'AR', lat, lng, birds,
    comparableNow: 0, comparablePrevious: 0, date: '2026-11-10', species: [], ...extra,
  }
}

describe('distanceKm and directionFrom', () => {
  it('measures a degree of latitude as about 111 km', () => {
    expect(distanceKm(34, -91, 35, -91)).toBeCloseTo(111.2, 0)
  })
  it('gives compass directions', () => {
    expect(directionFrom(34, -91, 35, -91)).toBe('N')
    expect(directionFrom(34, -91, 33.5, -90.4)).toBe('SE')
  })
})

describe('clusterPoints', () => {
  it('groups nearby points around the largest and keeps far ones apart', () => {
    const groups = clusterPoints([
      pt('small-near', 34.55, -91.55, 300),
      pt('big', 34.5, -91.5, 50000),
      pt('far', 36.0, -90.0, 2000),
    ])
    expect(groups.map(g => g.map(p => p.id))).toEqual([['big', 'small-near'], ['far']])
  })
})

describe('nameArea', () => {
  const places: Place[] = [
    ['Stuttgart', 'AR', 'Arkansas County', 7788, 34.4952, -91.5486],
    ['Crossroads', 'AR', '', 0, 34.45, -91.4],
    ['Memphis', 'TN', 'Shelby County', 620000, 34.6, -91.6],
  ]
  it('prefers a recognizable same-state town over a nearer crossroads', () => {
    const t = nameArea(34.43, -91.42, 'AR', places)!
    expect(t.town).toBe('Stuttgart')
    expect(t.county).toBe('Arkansas County')
    expect(t.direction).toBe('SE')
    expect(t.distanceKm).toBeGreaterThan(10)
  })
  it('returns null with nothing within 60 km', () => {
    expect(nameArea(40, -100, 'KS', places)).toBeNull()
  })
})

describe('summarizeArea', () => {
  it('adds up birds, sources, species and the comparable change', () => {
    const s = summarizeArea([
      pt('refuge', 34.5, -91.5, 9000, { comparableNow: 9000, comparablePrevious: 6000, species: [{ slug: 'mallard', name: 'Mallard', count: 9000 }] }),
      pt('hotspot', 34.6, -91.6, 1000, { kind: 'ebird', date: '2026-11-15', species: [{ slug: 'mallard', name: 'Mallard', count: 1000 }] }),
      pt('report', 34.55, -91.55, 30, { kind: 'report', state: 'AR', species: [] }),
    ])
    expect(s).toMatchObject({
      state: 'AR', birds: 10030, surveyBirds: 9000, surveySites: 1, ebirdBirds: 1000, ebirdPlaces: 1, hunterReports: 1,
      change: { now: 9000, previous: 6000, percent: 50 }, latestDate: '2026-11-15',
    })
    expect(s.topSpecies).toEqual([{ slug: 'mallard', name: 'Mallard', count: 10000 }])
    expect(s.lat).toBeGreaterThan(34.5)
    expect(s.lat).toBeLessThan(34.52)
  })
  it('has no change without comparable surveys', () => {
    expect(summarizeArea([pt('a', 34, -91, 100)]).change).toBeNull()
  })
})

describe('scoreArea', () => {
  const base = summarizeArea([pt('a', 34, -91, 10000)])
  it('is the birds when nothing else is known', () => {
    expect(scoreArea(base, 0, 'open')).toBe(10000)
  })
  it('rises with counts going up and a cold front, and sinks when closed', () => {
    const rising = { ...base, change: { now: 10000, previous: 5000, percent: 100 } }
    expect(scoreArea(rising, 3, 'open')).toBe(19500)
    expect(scoreArea(base, 0, 'closed')).toBe(2500)
  })
  it('caps a huge jump and a steep fall', () => {
    expect(scoreArea({ ...base, change: { now: 1, previous: 1, percent: 900 } }, 0, 'open')).toBe(15000)
    expect(scoreArea({ ...base, change: { now: 1, previous: 1, percent: -95 } }, 0, 'open')).toBe(7500)
  })
})

describe('publicLandsNear', () => {
  const lands: PublicLand[] = [
    ['Tiny Natural Area', 'State conservation area', 'Unknown', 'AR', 'RA', 41, 34.31, -91.65],
    ['Bayou Meto', 'State wildlife area', 'State Fish and Wildlife', 'AR', 'RA', 32022, 34.29, -91.66],
    ['Far WMA', 'State wildlife area', 'State Fish and Wildlife', 'AR', 'OA', 50000, 35.5, -91.6],
  ]
  it('lists big units before tiny nearer ones, and leaves out land beyond reach', () => {
    const found = publicLandsNear(34.4, -91.6, 10, 6, lands)
    expect(found.map(l => l.name)).toEqual(['Bayou Meto', 'Tiny Natural Area'])
    expect(found[0]).toMatchObject({ manager: 'State Fish and Wildlife', access: 'RA', acres: 32022, direction: 'SW' })
    expect(found[1].manager).toBeNull()
  })
})

describe('sameUnit', () => {
  it('matches a survey site and a public land unit with the same name', () => {
    expect(sameUnit('Loess Bluffs National Wildlife Refuge', 'Loess Bluffs NWR')).toBe(true)
    expect(sameUnit('Bayou Meto', 'Big Lake')).toBe(false)
  })
})

describe('isSightingsOnly', () => {
  const ebirdOnly = summarizeArea([pt('park', 41.9, -87.6, 5000, { kind: 'ebird' })])
  it('flags an area of eBird sightings with no public land, and sinks its score', () => {
    expect(isSightingsOnly(ebirdOnly, 0)).toBe(true)
    expect(scoreArea(ebirdOnly, 0, 'open', true)).toBe(1000)
  })
  it('keeps an area with public land, a survey site or a hunter report', () => {
    expect(isSightingsOnly(ebirdOnly, 2)).toBe(false)
    expect(isSightingsOnly(summarizeArea([pt('refuge', 34, -91, 100)]), 0)).toBe(false)
    expect(isSightingsOnly(summarizeArea([pt('r', 34, -91, 30, { kind: 'report' })]), 0)).toBe(false)
  })
})
