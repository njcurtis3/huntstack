import { describe, expect, it } from 'vitest'
import { bagLimitFor, findOpenSeason, getMigrationStatus, type SeasonRow } from './hunt.js'

describe('getMigrationStatus', () => {
  it('maps a new location (no prior count) to first_survey', () => {
    expect(getMigrationStatus('new', null)).toBe('first_survey')
  })

  it('maps no_data trend to no_data status', () => {
    expect(getMigrationStatus('no_data', null)).toBe('no_data')
  })

  it('maps a strong increase (>20%) to arriving', () => {
    expect(getMigrationStatus('increasing', 25)).toBe('arriving')
  })

  it('maps a mild increase (<=20%) to building', () => {
    expect(getMigrationStatus('increasing', 15)).toBe('building')
  })

  it('treats a null deltaPercent on an increasing trend as building, not arriving', () => {
    expect(getMigrationStatus('increasing', null)).toBe('building')
  })

  it('maps a stable trend to peak', () => {
    expect(getMigrationStatus('stable', 2)).toBe('peak')
  })

  it('maps a strong decrease (<-20%) to departing', () => {
    expect(getMigrationStatus('decreasing', -25)).toBe('departing')
  })

  it('maps a mild decrease (>=-20%) to declining', () => {
    expect(getMigrationStatus('decreasing', -10)).toBe('declining')
  })

  it('treats a null deltaPercent on a decreasing trend as declining, not departing', () => {
    expect(getMigrationStatus('decreasing', null)).toBe('declining')
  })

  it('falls back to no_data for an unrecognized trend', () => {
    expect(getMigrationStatus('bogus', 10)).toBe('no_data')
  })
})

describe('findOpenSeason', () => {
  const season = (over: Partial<SeasonRow>): SeasonRow => ({
    state_code: 'TX', species_slug: 'mallard', season_name: 'Regular Season (Split 2) - North Zone',
    start_date: '2026-12-05', end_date: '2027-01-31', bag_limit: null, applies_to: 'ducks', zone: 'North Zone', ...over,
  })

  it("uses a species' own season first", () => {
    const own = season({ species_slug: 'snow-goose', applies_to: null, season_name: 'Light Geese - Western Zone' })
    const map = new Map([['TX:snow-goose', own], ['TX:*ducks', season({})]])
    expect(findOpenSeason(map, 'TX', 'snow-goose')).toBe(own)
  })

  it('falls back to the all-duck season for ducks without their own', () => {
    const ducks = season({})
    const map = new Map([['TX:*ducks', ducks]])
    expect(findOpenSeason(map, 'TX', 'pintail')).toBe(ducks)
    expect(findOpenSeason(map, 'TX', 'green-winged-teal')).toBe(ducks)
  })

  it('never opens geese or dusky ducks through the all-duck season', () => {
    const map = new Map([['TX:*ducks', season({})]])
    expect(findOpenSeason(map, 'TX', 'canada-goose')).toBeNull()
    expect(findOpenSeason(map, 'TX', 'mottled-duck')).toBeNull()  // closed the first five days
  })

  it("doesn't borrow another state's season", () => {
    const map = new Map([['TX:*ducks', season({})]])
    expect(findOpenSeason(map, 'OK', 'pintail')).toBeNull()
  })
})

describe('bagLimitFor', () => {
  const aggregate: SeasonRow = {
    state_code: 'TX', species_slug: 'mallard', season_name: 'x', start_date: '', end_date: '',
    applies_to: 'ducks', zone: null,
    bag_limit: { daily: 6, possession: 18, speciesLimits: { mallard: 5, pintail: 3, scaup: 1 } },
  }

  it("shows a species' own cap inside the aggregate", () => {
    expect(bagLimitFor(aggregate, 'pintail')).toMatchObject({ daily: 3, aggregateDaily: 6, possession: 18 })
    expect(bagLimitFor(aggregate, 'scaup')).toMatchObject({ daily: 1, aggregateDaily: 6 })
  })

  it('shows the aggregate for species without their own cap', () => {
    expect(bagLimitFor(aggregate, 'gadwall')).toMatchObject({ daily: 6 })
    expect(bagLimitFor(aggregate, 'gadwall')).not.toHaveProperty('aggregateDaily')
  })

  it('decodes a double-encoded bag limit and handles no season', () => {
    expect(bagLimitFor({ ...aggregate, bag_limit: JSON.stringify(aggregate.bag_limit) }, 'mallard')).toMatchObject({ daily: 5 })
    expect(bagLimitFor(null, 'mallard')).toBeNull()
  })
})
