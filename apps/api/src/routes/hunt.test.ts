import { describe, expect, it } from 'vitest'
import { bagLimitFor, findOpenSeason, getMigrationStatus, huntZonesOf, seasonDatesApply, seasonDisplayName, type SeasonRow } from './hunt.js'

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
    const map = new Map([['TX:snow-goose', [own]], ['TX:*ducks', [season({})]]])
    expect(findOpenSeason(map, 'TX', 'snow-goose')).toBe(own)
  })

  it('falls back to the all-duck season for ducks without their own', () => {
    const ducks = season({})
    const map = new Map([['TX:*ducks', [ducks]]])
    expect(findOpenSeason(map, 'TX', 'pintail')).toBe(ducks)
    expect(findOpenSeason(map, 'TX', 'green-winged-teal')).toBe(ducks)
  })

  it('never opens geese or dusky ducks through the all-duck season', () => {
    const map = new Map([['TX:*ducks', [season({})]]])
    expect(findOpenSeason(map, 'TX', 'canada-goose')).toBeNull()
    expect(findOpenSeason(map, 'TX', 'mottled-duck')).toBeNull()  // closed the first five days
  })

  it("doesn't borrow another state's season", () => {
    const map = new Map([['TX:*ducks', [season({})]]])
    expect(findOpenSeason(map, 'OK', 'pintail')).toBeNull()
  })

  describe('with a mapped location', () => {
    const panhandle = season({ state_code: 'OK', zone: 'Panhandle Counties', season_name: 'Regular Duck Season - Panhandle Counties' })
    const zones12 = season({ state_code: 'OK', zone: 'Zones 1 and 2', season_name: 'Regular Duck Season (Split 1) - Zones 1 and 2' })

    it("only sees its own zone's season (Salt Plains NWR on Oct 27: closed)", () => {
      const map = new Map([['OK:*ducks', [panhandle]]])
      expect(findOpenSeason(map, 'OK', 'pintail', ['Zones 1 and 2'])).toBeNull()
      expect(findOpenSeason(map, 'OK', 'pintail', ['Panhandle Counties'])).toMatchObject({ zone_matched: true })
    })

    it('picks its zone when several are open, and statewide seasons always apply', () => {
      const map = new Map([['OK:*ducks', [panhandle, zones12]], ['OK:snow-goose', [season({ state_code: 'OK', species_slug: 'snow-goose', applies_to: null, zone: 'Statewide' })]]])
      expect(findOpenSeason(map, 'OK', 'pintail', ['Zones 1 and 2'])?.season_name).toBe(zones12.season_name)
      expect(findOpenSeason(map, 'OK', 'snow-goose', ['Zones 1 and 2'])).toMatchObject({ zone_matched: true })
    })

    it("falls back to the all-duck season when a duck's own seasons are in other zones", () => {
      // NM Pacific Flyway scaup at a Central Flyway refuge
      const pfScaup = season({ state_code: 'NM', species_slug: 'scaup', applies_to: null, zone: 'Pacific Flyway (North and South Zones)' })
      const cfDucks = season({ state_code: 'NM', zone: 'Central Flyway South Zone' })
      const map = new Map([['NM:scaup', [pfScaup]], ['NM:*ducks', [cfDucks]]])
      expect(findOpenSeason(map, 'NM', 'scaup', ['Central Flyway South Zone'])?.zone).toBe('Central Flyway South Zone')
    })

    it('flags several open zones only when the location is unmapped', () => {
      const map = new Map([['OK:*ducks', [panhandle, zones12]]])
      expect(findOpenSeason(map, 'OK', 'pintail')).toMatchObject({ other_zones_open: true })
      expect(findOpenSeason(map, 'OK', 'pintail', ['Panhandle Counties'])).not.toHaveProperty('other_zones_open')
    })
  })
})

describe('huntZonesOf', () => {
  it('reads metadata.huntZones, including double-encoded metadata', () => {
    expect(huntZonesOf({ huntZones: ['West Zone'] })).toEqual(['West Zone'])
    expect(huntZonesOf(JSON.stringify({ huntZones: ['West Zone'] }))).toEqual(['West Zone'])
    expect(huntZonesOf({ flyway: 'central' })).toBeNull()
    expect(huntZonesOf({ huntZones: [] })).toBeNull()
    expect(huntZonesOf(null)).toBeNull()
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

describe('seasonDisplayName / seasonDatesApply', () => {
  const base: SeasonRow = {
    state_code: 'OK', species_slug: 'mallard', season_name: 'Regular Duck Season - Panhandle Counties',
    start_date: '2026-10-10', end_date: '2027-01-13', bag_limit: null, applies_to: 'ducks', zone: 'Panhandle Counties',
  }

  it('names the zone and hides its dates when only one zone is open', () => {
    // Oct 27: only the Oklahoma Panhandle is open; Salt Plains NWR is in Zone 1
    expect(seasonDisplayName(base)).toBe("Open only in Panhandle Counties — check your zone's dates")
    expect(seasonDatesApply(base)).toBe(false)
  })

  it('says several zones are open when they are', () => {
    expect(seasonDisplayName({ ...base, other_zones_open: true })).toBe("Open in some zones — check your zone's dates")
    expect(seasonDatesApply({ ...base, other_zones_open: true })).toBe(false)
  })

  it("shows a matched zone's own name and dates", () => {
    expect(seasonDisplayName({ ...base, zone_matched: true })).toBe(base.season_name)
    expect(seasonDatesApply({ ...base, zone_matched: true })).toBe(true)
  })

  it('shows statewide seasons as they are', () => {
    const statewide = { ...base, state_code: 'AR', season_name: 'Regular Duck Season (Split 1) - Statewide', zone: 'Statewide' }
    expect(seasonDisplayName(statewide)).toBe('Regular Duck Season (Split 1) - Statewide')
    expect(seasonDatesApply(statewide)).toBe(true)
    expect(seasonDatesApply({ ...statewide, zone: null })).toBe(true)
    expect(seasonDisplayName(null)).toBeNull()
  })
})
