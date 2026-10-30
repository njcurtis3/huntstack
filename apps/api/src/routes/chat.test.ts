import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY_CHARS,
  MAX_HISTORY_MESSAGES,
  currentSeasonLabel,
  documentFilters,
  extractEntities,
  formatBagLimit,
  formatMidwinterHistory,
  formatShootingHours,
  formatEBirdSightings,
  formatSurveyZones,
  needsDocuments,
  structuredPlan,
  surveyAgeNote,
  truncateHistory,
  withAreaHint,
} from './chat.js'

describe('documentFilters', () => {
  const filters = (q: string) => documentFilters(extractEntities(q))

  it('limits document search to the states a question names', () => {
    expect(filters('Texas light goose conservation order').stateCodes).toEqual(['TX'])
    expect(filters('when does duck season open?').stateCodes).toEqual([])
  })

  it('leaves out reports on a rules question', () => {
    for (const q of [
      'Arkansas duck season bag limit mallards',
      'What is the daily duck bag limit in Arkansas this season, and how many can be mallards?',
      'do I need a HIP stamp in Kansas',
      'when does teal season close in Oklahoma',
      'what licenses are required for nonresidents in New Mexico',
      'shooting hours in Louisiana',
    ]) {
      expect(filters(q).skipReports, q).toBe(true)
    }
  })

  it('keeps reports when the question is about birds or places, or not about rules', () => {
    for (const q of [
      'how many ducks are in Arkansas right now',
      'latest refuge counts for the season in Kansas',
      'duck numbers in Arkansas this season',
      'where should I hunt in Kansas this season',
      'what do mallards eat',
      'is my relationship with ducks healthy',
    ]) {
      expect(filters(q).skipReports, q).toBe(false)
    }
  })
})

describe('currentSeasonLabel', () => {
  it('rolls over in July', () => {
    expect(currentSeasonLabel(new Date('2026-10-28T12:00:00Z'))).toBe('2026-27')
    expect(currentSeasonLabel(new Date('2027-01-15T12:00:00Z'))).toBe('2026-27')
    expect(currentSeasonLabel(new Date('2027-07-01T12:00:00Z'))).toBe('2027-28')
    expect(currentSeasonLabel(new Date('2099-03-01T12:00:00Z'))).toBe('2098-99')
  })
})

describe('extractEntities', () => {
  it('extracts a state name and species alias', () => {
    const result = extractEntities('snow geese in texas')
    expect(result.stateCodes).toEqual(['TX'])
    expect(result.speciesSlugs).toEqual(['snow-goose'])
    expect(result.isWaterfowl).toBe(true)
  })

  it('does not match a state alias inside another word', () => {
    // "co" (Colorado) must not match inside "cook" or similar; word-boundary
    // regex guards against this false-positive class.
    const result = extractEntities('what should I cook for dinner')
    expect(result.stateCodes).toEqual([])
  })

  it('matches multiple state codes and dedupes', () => {
    const result = extractEntities('regulations for TX and NM and Texas again')
    expect(new Set(result.stateCodes)).toEqual(new Set(['TX', 'NM']))
  })

  it('matches a hyphenated multi-word species alias', () => {
    const result = extractEntities('any info on green-winged teal?')
    expect(result.speciesSlugs).toEqual(['green-winged-teal'])
  })

  it('flags a location query from its keywords', () => {
    const result = extractEntities('where should I hunt this weekend')
    expect(result.isLocationQuery).toBe(true)
  })

  it('flags a weather query from its keywords', () => {
    const result = extractEntities('is there a cold front coming')
    expect(result.isWeatherQuery).toBe(true)
  })

  it('flags a migration query from its keywords', () => {
    const result = extractEntities('what are the latest refuge counts')
    expect(result.isMigrationQuery).toBe(true)
  })

  it('treats a broad waterfowl keyword as waterfowl-relevant even with no specific species', () => {
    const result = extractEntities('any ducks moving around Arkansas')
    expect(result.isWaterfowl).toBe(true)
    expect(result.stateCodes).toEqual(['AR'])
  })

  it('returns empty/false for an unrelated query', () => {
    const result = extractEntities('what time is it')
    expect(result).toEqual({
      stateCodes: [],
      speciesSlugs: [],
      isWaterfowl: false,
      isMigrationQuery: false,
      isLocationQuery: false,
      isWeatherQuery: false,
      isRegulationQuery: false,
      isBirdsNowQuery: false,
    })
  })
})

describe('formatBagLimit', () => {
  it('formats daily/possession/season fields', () => {
    const result = formatBagLimit({ daily: 6, possession: 18, season: 'none' })
    expect(result).toBe(', bag limit: daily: 6, possession: 18, season: none')
  })

  it('handles a double-encoded JSON string (Drizzle jsonb quirk)', () => {
    const encoded = JSON.stringify({ daily: 3 })
    expect(formatBagLimit(encoded)).toBe(', bag limit: daily: 3')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatBagLimit(null)).toBe('')
    expect(formatBagLimit(undefined)).toBe('')
  })

  it('renders a null field value as "none"', () => {
    expect(formatBagLimit({ daily: null })).toBe(', bag limit: daily: none')
  })
})

describe('formatShootingHours', () => {
  it('formats a start/end object', () => {
    expect(formatShootingHours({ start: '30 min before sunrise', end: 'sunset' })).toBe(
      '30 min before sunrise to sunset'
    )
  })

  it('passes through a plain string unchanged when decoding fails', () => {
    expect(formatShootingHours('sunrise to sunset')).toBe('sunrise to sunset')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatShootingHours(null)).toBe('')
    expect(formatShootingHours(undefined)).toBe('')
  })
})

describe('truncateHistory', () => {
  const msg = (i: number, len = 10): { role: 'user' | 'assistant'; content: string } => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'x'.repeat(len),
  })

  it('returns undefined for missing or empty history', () => {
    expect(truncateHistory(undefined)).toBeUndefined()
    expect(truncateHistory([])).toBeUndefined()
  })

  it('passes through history already within both limits', () => {
    const history = [msg(0), msg(1)]
    expect(truncateHistory(history)).toEqual(history)
  })

  it('keeps only the most recent MAX_HISTORY_MESSAGES turns', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message-${i}`,
    }))
    const result = truncateHistory(history)!
    expect(result).toHaveLength(MAX_HISTORY_MESSAGES)
    // Oldest dropped, newest retained
    expect(result[0].content).toBe(`message-${20 - MAX_HISTORY_MESSAGES}`)
    expect(result[result.length - 1].content).toBe('message-19')
  })

  it('caps the length of each individual message', () => {
    const result = truncateHistory([msg(0, 4000)])!
    expect(result[0].content).toHaveLength(MAX_HISTORY_CHARS)
  })

  it('bounds the worst-case payload the schema allows', () => {
    // Schema permits 20 messages x 4000 chars (~80k chars). Truncation must cut that down
    // regardless of what the client sends -- this is the cost guarantee (see
    // INFRASTRUCTURE_COSTS.md section 5.1), so assert the total directly.
    const worstCase = Array.from({ length: 20 }, (_, i) => msg(i, 4000))
    const total = truncateHistory(worstCase)!.reduce((n, m) => n + m.content.length, 0)
    expect(total).toBe(MAX_HISTORY_MESSAGES * MAX_HISTORY_CHARS)
    expect(total).toBeLessThan(80_000)
  })

  it('preserves roles', () => {
    const result = truncateHistory([msg(0), msg(1)])!
    expect(result.map(m => m.role)).toEqual(['user', 'assistant'])
  })
})

describe('formatBagLimit — species caps inside an aggregate', () => {
  it('lists the per-species limits and notes', () => {
    const result = formatBagLimit({
      daily: 6, possession: 18,
      speciesLimits: { mallard: 5, pintail: 3, 'mottled-duck': 1 },
      notes: 'No more than 2 of the 5 mallards may be hens.',
    })
    expect(result).toBe(
      ', bag limit: daily: 6, possession: 18, within that, no more than mallard: 5 per day; pintail: 3 per day; mottled duck: 1 per day, No more than 2 of the 5 mallards may be hens.',
    )
  })
})

describe('formatMidwinterHistory', () => {
  it('writes one sorted line per region and species, with short numbers', () => {
    const out = formatMidwinterHistory([
      { region: 'TX High Plains', year: 1998, species: 'Snow Goose', total: 70420 },
      { region: 'TX High Plains', year: 1997, species: 'Snow Goose', total: 1_400_000 },
      { region: 'TX High Plains', year: 1997, species: 'Mallard', total: 62080 },
    ])
    expect(out).toContain('- TX High Plains — Snow Goose: 1997 1.40M, 1998 70k')
    expect(out).toContain('- TX High Plains — Mallard: 1997 62k')
    expect(out).toMatch(/not current-season/)
  })
})

describe('extractEntities Panhandle places', () => {
  it('reads Amarillo and Lubbock as Texas', () => {
    expect(extractEntities('snow geese near Amarillo').stateCodes).toEqual(['TX'])
    expect(extractEntities('ducks around lubbock').stateCodes).toEqual(['TX'])
  })
})

describe('formatSurveyZones', () => {
  const row = (zone: string, mallards: number, totalDucks: number | null, avgM: number | null, avgT: number | null) => ({
    region: 'Delta', zone, period: 'Jan-26', surveyDate: '2026-01-23 00:00:00',
    mallards, totalDucks, avgMallards: avgM, avgTotalDucks: avgT,
  })

  it('lists zones busiest first against their average, and says they are part of the statewide count', () => {
    const text = formatSurveyZones([
      row('Cache', 30_234, 54_407, 60_000, 100_000),
      row('Lower St. Francis', 74_095, 132_745, 50_000, null),
    ])
    const lines = text.split('\n')
    expect(lines[0]).toContain('late-January survey ending 2026-01-23')
    expect(lines[0]).toContain('not additional birds')
    expect(lines[1]).toBe('- Lower St. Francis (Delta): 132,745 ducks, 74,095 mallards (+48% vs avg)')
    expect(lines[2]).toBe('- Cache (Delta): 54,407 ducks (-46% vs avg), 30,234 mallards (-50% vs avg)')
  })
})

describe('structuredPlan', () => {
  const plan = (q: string) => structuredPlan(extractEntities(q))
  const used = (q: string) => Object.entries(plan(q)).filter(([, on]) => on).map(([k]) => k).sort()

  it('uses no HuntStack records for general questions', () => {
    for (const q of [
      'What decoy spread works best for mallards?',
      'how do I cook a duck',
      'best shotgun choke for geese',
      'how do you call pintails',
    ]) {
      expect(used(q), q).toEqual([])
    }
  })

  it('uses seasons, licenses and regulations, not counts or areas, for a rules question about a state', () => {
    expect(used('Kansas duck bag limit')).toEqual(['licenses', 'regulations', 'seasons'])
  })

  it('uses every state’s seasons for a species rules question with no state', () => {
    const p = plan('when does pintail season open?')
    expect(p.seasons).toBe(true)
    expect(p.refugeCounts).toBe(false)
  })

  it('uses counts and push factors when the question is about where birds are now', () => {
    for (const q of ['where are the snow geese right now?', 'are mallards moving yet', 'how many ducks are on the refuges']) {
      const p = plan(q)
      expect(p.refugeCounts, q).toBe(true)
      expect(p.pushFactors, q).toBe(true)
      expect(p.seasons, q).toBe(false)
    }
  })

  it('uses rules, areas and counts for a planning question about a state', () => {
    const p = plan('Is duck season open in the Kansas Low Plains this weekend?')
    expect(p.seasons).toBe(true)
    expect(p.locations).toBe(true)
    expect(p.refugeCounts).toBe(true)
  })

  it('keeps areas for a where-to-hunt question', () => {
    expect(plan('where should I hunt ducks in Arkansas').locations).toBe(true)
  })
})

describe('needsDocuments', () => {
  const needs = (q: string) => needsDocuments(extractEntities(q))

  it('skips document search for general questions', () => {
    for (const q of ['What decoy spread works best for mallards?', 'how do I cook a duck', 'best shotgun choke for geese']) {
      expect(needs(q), q).toBe(false)
    }
  })

  it('searches documents for state, rules and where-to-hunt questions', () => {
    for (const q of [
      'Kansas duck bag limit',
      'what is HIP certification',
      'where should I hunt ducks in Kansas',
      'Arkansas duck hunting tips',
    ]) {
      expect(needs(q), q).toBe(true)
    }
  })

  it('skips documents when the question is only about where birds are now', () => {
    for (const q of ['where are the snow geese right now?', 'Where are the ducks right now?', 'how many ducks are in Arkansas right now', 'latest refuge counts']) {
      expect(needs(q), q).toBe(false)
    }
  })
})

describe('snow geese right now', () => {
  const q = 'Where are the snow geese right now?'

  it('asks for eBird sightings and counts, not rules', () => {
    const p = structuredPlan(extractEntities(q))
    expect(p.ebirdSightings).toBe(true)
    expect(p.refugeCounts).toBe(true)
    expect(p.seasons).toBe(false)
  })

  it('leaves eBird out of rules and general questions', () => {
    expect(structuredPlan(extractEntities('Kansas duck bag limit')).ebirdSightings).toBe(false)
    expect(structuredPlan(extractEntities('What decoy spread works best for mallards?')).ebirdSightings).toBe(false)
  })

  it('names our flyways for the web search when no state is named', () => {
    expect(withAreaHint(q, extractEntities(q))).toContain('Central and Mississippi Flyways')
    expect(withAreaHint('when does pintail season open?', extractEntities('when does pintail season open?')))
      .toContain('Central and Mississippi Flyways')
  })

  it('leaves the message alone when it names a state or is a general question', () => {
    for (const m of ['Where are the snow geese in Arkansas right now?', 'What decoy spread works best for mallards?']) {
      expect(withAreaHint(m, extractEntities(m))).toBe(m)
    }
  })
})

describe('surveyAgeNote', () => {
  const now = new Date('2026-10-30T12:00:00Z')
  it('says nothing for a survey within 3 weeks', () => {
    expect(surveyAgeNote('2026-10-20', now)).toBe('')
    expect(surveyAgeNote(null, now)).toBe('')
  })
  it('marks older surveys as not current', () => {
    expect(surveyAgeNote('2026-01-23', now)).toBe(' - 40 weeks old, not current')
    expect(surveyAgeNote('2024-01-15', now)).toBe(' - 2+ years old, not current')
  })
})

describe('formatEBirdSightings', () => {
  const row = (state: string, speciesName: string, places: number, topPlaces = [] as Array<{ name: string; count: number; date: string }>) => ({
    state, species: speciesName.toLowerCase(), speciesName, places, topPlaces,
  })

  it('lists states with the most places first, with the largest reports', () => {
    const text = formatEBirdSightings([
      row('KS', 'Snow Goose', 2),
      row('AR', 'Snow Goose', 5, [{ name: 'Sheffield Nelson Dagmar WMA', count: 50, date: '2026-10-30' }]),
      row('TX', 'Snow Goose', 1),
    ])
    const lines = text.split('\n')
    expect(lines[0]).toMatch(/not surveys/)
    expect(lines[1]).toBe('- AR Snow Goose: reported at 5 places. Largest: Sheffield Nelson Dagmar WMA 50 (2026-10-30)')
    expect(lines[2]).toBe('- KS Snow Goose: reported at 2 places')
    expect(lines[3]).toBe('- TX Snow Goose: reported at 1 place')
  })

  it('keeps the most reported species per state', () => {
    const text = formatEBirdSightings([
      row('AR', 'Mallard', 1), row('AR', 'Gadwall', 9), row('AR', 'Teal', 4), row('AR', 'Wigeon', 6),
    ])
    expect(text).not.toContain('Mallard')
    expect(text.indexOf('Gadwall')).toBeLessThan(text.indexOf('Wigeon'))
  })
})
