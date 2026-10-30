import { describe, expect, it } from 'vitest'
import { EBIRD_SPECIES_CODES, publicPlaceName, summarizeSpeciesReports } from './ebird.js'

// Taken from eBird's /ref/taxonomy/ebird on 2026-10-27. Codes that aren't real eBird
// species codes never match an observation, so a typo silently drops a species.
const VALID_EBIRD_CODES = new Set([
  'mallar3', 'norpin', 'snogoo', 'cangoo', 'gwfgoo', 'rosgoo', 'gadwal', 'norsho', 'amewig',
  'gnwtea', 'buwtea', 'canvas', 'redhea', 'lessca', 'gresca', 'buffle', 'rudduc', 'rinduc',
  'motduc', 'cacgoo1', 'y00470', 'sxrgoo1', 'y00469', 'scaup', 'y00314', 'teal',
])

describe('EBIRD_SPECIES', () => {
  it('uses only real eBird species codes', () => {
    expect(EBIRD_SPECIES_CODES.filter(c => !VALID_EBIRD_CODES.has(c))).toEqual([])
  })
})

describe('summarizeSpeciesReports', () => {
  const obs = (speciesCode: string, locName: string, howMany: number | null, obsDt = '2026-10-29 08:00') =>
    ({ speciesCode, comName: '', howMany, obsDt, locId: locName, locName, obsValid: true })

  it('groups codes under one species and keeps the largest report per place', () => {
    const [r] = summarizeSpeciesReports([
      { state: 'AR', obs: [obs('snogoo', 'Dagmar WMA', 50), obs('y00469', 'Dagmar WMA', 80, '2026-10-30 07:00'), obs('snogoo', 'Hazen', 20), obs('snogoo', 'Shores Lake', null)] },
    ])
    expect(r.species).toBe('snow-goose')
    expect(r.places).toBe(3)
    expect(r.topPlaces).toEqual([
      { name: 'Dagmar WMA', count: 80, date: '2026-10-30' },
      { name: 'Hazen', count: 20, date: '2026-10-29' },
    ])
  })

  it('never names a private location', () => {
    const [r] = summarizeSpeciesReports([
      { state: 'LA', obs: [{ ...obs('mallar3', '8812 Belle Grove Pl', 48), locationPrivate: true }, obs('mallar3', 'LaFreniere Park', 40)] },
    ])
    expect(r.places).toBe(2)
    expect(r.topPlaces.map(p => p.name)).toEqual(['LaFreniere Park'])
  })

  it('skips species outside the waterfowl list', () => {
    expect(summarizeSpeciesReports([{ state: 'TX', obs: [obs('amerob', 'Park', 3)] }])).toEqual([])
  })
})

describe('publicPlaceName', () => {
  it('shows hotspots as they are', () => {
    expect(publicPlaceName('Loess Bluffs NWR', false)).toBe('Loess Bluffs NWR')
  })

  it('shows a personal pin on public land, without the town and coordinates', () => {
    expect(publicPlaceName('Swan Lake National Wildlife Refuge, Sumner US-MO 39.6, -93.2', true)).toBe('Swan Lake National Wildlife Refuge')
    expect(publicPlaceName('Otter Slough CA', true)).toBe('Otter Slough CA')
  })

  it('never names addresses, yards or private land', () => {
    for (const name of [
      '11100-11118 N Cattle Dr, Fortuna US-MO (38.5111,-92.8)',
      '3951 County Rd 259 (PRIVATE)',
      '8812 Belle Grove Pl',
      'Highland Dr. (yard) - Marrero, LA',
      'Smith family farm',
      'Near Home',
    ]) {
      expect(publicPlaceName(name, true), name).toBeNull()
    }
  })
})
