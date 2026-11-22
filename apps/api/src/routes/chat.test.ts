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
  formatHuntAreas,
  areasNearTown,
  findTown,
  findStates,
  type HuntAreaSummary,
  formatSurveyZones,
  needsDocuments,
  structuredPlan,
  surveySiteContext,
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

  it('keeps reports when the question is about bird numbers or places', () => {
    for (const q of [
      'how many ducks are in Arkansas right now',
      'latest refuge counts for the season in Kansas',
      'duck numbers in Arkansas this season',
      'where should I hunt in Kansas this season',
    ]) {
      expect(filters(q).skipReports, q).toBe(false)
    }
  })

  it('leaves out reports on general questions about a state', () => {
    for (const q of [
      'Arkansas duck hunting tips',
      'best decoy setup for Kansas mallards',
      'what do mallards eat',
    ]) {
      expect(filters(q).skipReports, q).toBe(true)
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
      isPopulationQuery: false,
      isWhereToHuntQuery: false,
      town: null,
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

describe('breeding population questions', () => {
  it('search only the stateless breeding survey report', () => {
    for (const q of [
      'How are pintail numbers this year?',
      'what was the 2026 breeding population of mallards',
      'how big is the fall flight',
    ]) {
      const e = extractEntities(q)
      expect(e.isPopulationQuery, q).toBe(true)
      expect(needsDocuments(e), q).toBe(true)
      expect(documentFilters(e), q).toEqual({ stateless: true })
    }
  })

  it('with a state and "season", search that state plus the stateless report', () => {
    const e = extractEntities('How are mallard numbers looking for Arkansas this season?')
    expect(e.isPopulationQuery).toBe(true)
    expect(needsDocuments(e)).toBe(true)
    // chunkConditions admits documents with no state alongside the named states
    expect(documentFilters(e)).toEqual({ stateCodes: ['AR'], skipReports: false })
  })

  it('leave count questions alone', () => {
    for (const q of ['duck numbers in Arkansas this season', 'how many ducks are in Arkansas right now', 'latest refuge counts']) {
      expect(extractEntities(q).isPopulationQuery, q).toBe(false)
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

describe('formatEBirdSightings', () => {
  const row = (state: string, speciesName: string, places: number, topPlaces = [] as Array<{ name: string; count: number; date: string }>) => ({
    state, species: speciesName.toLowerCase(), speciesName, places, birds: 0, topPlaces,
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

describe('surveySiteContext', () => {
  const now = new Date('2026-11-21T12:00:00Z')
  const row = (loc: string, name: string, state: string, slug: string, count: number, date: string,
    prev: number | null = null, prevDate: string | null = null, metadata: unknown = null) => ({
    location_id: loc, refuge_name: name, state_code: state, species_slug: slug,
    species_name: slug === 'mallard' ? 'Mallard' : 'Snow Goose', count, survey_date: date,
    previous_count: prev, previous_date: prevDate, location_metadata: metadata,
  })
  const rows = [
    row('a', 'Salt Plains NWR', 'OK', 'mallard', 1, '2026-10-21'),            // older than 4 weeks
    row('b', 'Loess Bluffs NWR', 'MO', 'mallard', 20000, '2026-11-17', 26000, '2026-11-10'),
    row('b', 'Loess Bluffs NWR', 'MO', 'snow-goose', 5000, '2026-11-17'),
    row('c', 'Washita NWR', 'OK', 'snow-goose', 3000, '2026-11-18', null, null,
      { access: 'closed' }),
  ]

  it('keeps only the states asked about, and says when one has no current survey', () => {
    const ctx = surveySiteContext(rows, [], ['OK', 'LA'], [], now)
    expect(ctx.lines).toHaveLength(1)
    expect(ctx.lines[0]).toMatch(/^- Washita NWR \(OK\)/)
    expect(ctx.lines.join()).not.toMatch(/Salt Plains|Loess/)
    expect(ctx.notes).toContain('LA: no current survey count.')
  })

  it('totals a site over the species asked about, with the change worked out', () => {
    const ctx = surveySiteContext(rows, [], [], ['mallard'], now)
    expect(ctx.lines).toHaveLength(1)
    expect(ctx.lines[0]).toContain('Loess Bluffs NWR (MO)')
    expect(ctx.lines[0]).toContain('20,000 birds')
    expect(ctx.lines[0]).toMatch(/down/)
    expect(ctx.lines[0]).not.toContain('Snow Goose')
  })

  it('lists every state, largest site first, when no state is named', () => {
    const ctx = surveySiteContext(rows, [], [], [], now)
    expect(ctx.lines.map(l => l.match(/^- ([^(]+)/)![1].trim())).toEqual(['Loess Bluffs NWR', 'Washita NWR'])
  })

  it('carries what HuntStack knows about hunting access', () => {
    const ctx = surveySiteContext(rows, [], ['OK'], [], now)
    expect(ctx.lines[0]).toMatch(/; closed to waterfowl hunting$/)
    expect(surveySiteContext(rows, [], ['MO'], [], now).lines[0]).toMatch(/; hunting access not verified by HuntStack$/)
  })
})

describe('where-to-hunt questions', () => {
  it('are recognised in their usual forms', () => {
    for (const q of [
      'Where should I hunt this weekend?',
      'where can I go duck hunting in Arkansas',
      'Snow geese - best places near Amarillo?',
      'good spots to hunt mallards in Missouri',
      'any areas to hunt teal in Louisiana?',
    ]) {
      expect(extractEntities(q).isWhereToHuntQuery, q).toBe(true)
      expect(structuredPlan(extractEntities(q)).huntAreas, q).toBe(true)
    }
  })

  it('leave other questions alone', () => {
    for (const q of [
      'Kansas duck bag limit',
      'When does duck season open in Texas?',
      'where are the snow geese right now?',
      'what decoy spread works for mallards?',
    ]) {
      expect(structuredPlan(extractEntities(q)).huntAreas, q).toBe(false)
    }
  })
})

describe('formatHuntAreas', () => {
  const area: HuntAreaSummary = {
    id: 'loess-bluffs', title: 'Near Mound City, MO', state: 'MO', birds: 102989, surveyBirds: 102989, surveySites: 1,
    ebirdPlaces: 2, hunterReports: 0, change: { percent: -6 }, latestDate: '2026-11-10',
    topSpecies: [{ name: 'Gadwall', count: 28635 }, { name: 'Northern Pintail', count: 25135 }],
    season: { status: 'open', lines: ['Ducks: Middle Zone'] },
    push: { score: 2 },
    reasons: ['102,989 ducks and geese at 1 survey site', 'Counts down 6% since the previous surveys'],
    publicLands: [{ name: 'Bob Brown CA', kind: 'State Conservation Area', distanceKm: 16, direction: 'S', note: null }],
    huntable: [{ name: 'Loess Bluffs NWR', access: 'limited', accessNote: 'Light geese only' }],
    score: 9, center: { lat: 40.1, lng: -95.2 },
  }

  it('numbers the areas in order with their season, push, reasons and where to go', () => {
    const text = formatHuntAreas([area, { ...area, title: 'Near Quincy, IL', state: 'IL', push: null, publicLands: [], huntable: [], season: { status: 'unknown', lines: [] } }])
    expect(text).toContain('1. Near Mound City, MO (MO): season open (Ducks: Middle Zone); push score 2/3; most counted: Gadwall 28,635, Northern Pintail 25,135')
    expect(text).toContain('Why: 102,989 ducks and geese at 1 survey site; Counts down 6% since the previous surveys')
    expect(text).toContain('Bob Brown CA (State Conservation Area, 10 mi S)')
    expect(text).toContain('Loess Bluffs NWR (public waterfowl hunting only in part of the area or under limits (Light geese only))')
    expect(text).toContain('2. Near Quincy, IL (IL): season dates not in HuntStack; push score 0/3')
    expect(text).toContain('none found nearby; check with the state agency')
  })
})

describe('species names are whole words', () => {
  it('does not read "can", "Canada" or "American" as canvasback', () => {
    expect(extractEntities('Where can I go duck hunting in Missouri?').speciesSlugs).toEqual([])
    expect(extractEntities('Can I hunt Canada geese in Kansas?').speciesSlugs).toEqual(['canada-goose'])
    expect(extractEntities('american wigeon limit in Texas').speciesSlugs).toEqual(['american-wigeon'])
    expect(extractEntities('bearing north, any ducks?').speciesSlugs).toEqual([])
  })
  it("still finds hunters' names for birds", () => {
    expect(extractEntities('are the cans in yet?').speciesSlugs).toEqual(['canvasback'])
    expect(extractEntities('specks near Stuttgart').speciesSlugs).toEqual(['white-fronted-goose'])
  })
})

describe('findTown', () => {
  it('finds a town named after near / around / of', () => {
    expect(findTown('snow geese near amarillo?', ['TX'])).toMatchObject({ name: 'Amarillo', state: 'TX' })
    expect(findTown('ducks within 2 hours of st. charles', [])).toMatchObject({ name: 'St. Charles' })
    expect(findTown('where to hunt around stuttgart', [])).toMatchObject({ name: 'Stuttgart', state: 'AR' })
  })
  it('prefers the state the question names', () => {
    expect(findTown('ducks near stuttgart, kansas', ['KS'])).toMatchObject({ state: 'KS' })
  })
  it('ignores words that are not a sizeable town', () => {
    expect(findTown('where should i hunt this weekend', [])).toBeNull()
    expect(findTown('best spots near me', [])).toBeNull()
    expect(findTown('a lot of mallards', [])).toBeNull()
  })
  it("gives a question its town's state when it names none", () => {
    expect(extractEntities('Best spots around Sioux City for honkers').stateCodes).toEqual(['IA'])
    expect(extractEntities('Is Kansas City any good for geese').stateCodes).toEqual(['MO'])
    expect(extractEntities('where should I hunt near Stuttgart?').stateCodes).toEqual(['AR'])
  })
})

describe('areasNearTown', () => {
  const town = { name: 'Amarillo', state: 'TX', lat: 35.198, lng: -101.833 }
  const at = (title: string, state: string, score: number, lat: number, lng: number) => ({
    id: title, title, state, score, center: { lat, lng }, birds: 0, surveyBirds: 0, surveySites: 0, ebirdPlaces: 0,
    hunterReports: 0, change: null, latestDate: null, topSpecies: [], season: { status: 'open' as const, lines: [] },
    push: null, reasons: [], publicLands: [], huntable: [],
  })
  it('keeps areas within 180 miles, best first, once each', () => {
    const near = at('Near Hereford, TX', 'TX', 3, 34.82, -102.40)
    const nearer = at('Near Canyon, TX', 'TX', 5, 34.98, -101.92)
    const far = at('Near Sherman, TX', 'TX', 50, 33.64, -96.61)
    const got = areasNearTown([far, near, nearer, near], town)
    expect(got.map(a => a.title)).toEqual(['Near Canyon, TX', 'Near Hereford, TX'])
    expect(got[0].fromTown).toMatchObject({ town: 'Amarillo', direction: 'S' })
  })
  it('falls back to the 3 nearest, with their distance, when none is in reach', () => {
    const got = areasNearTown([at('Near Sherman, TX', 'TX', 50, 33.64, -96.61), at('17 mi N of Brownsville, TX', 'TX', 9, 26.15, -97.5)], town)
    expect(got.map(a => a.title)).toEqual(['Near Sherman, TX', '17 mi N of Brownsville, TX'])
    expect(got[0].fromTown!.miles).toBeGreaterThan(250)
    expect(formatHuntAreas(got)).toContain(`Near Sherman, TX (TX); ${got[0].fromTown!.miles} mi ESE`.slice(0, 30))
  })
})

describe('findStates', () => {
  it('knows every state by name, including ones HuntStack does not cover', () => {
    expect(findStates('Nebraska snow goose conservation order')).toEqual(['NE'])
    expect(findStates('ducks in South Dakota or Minnesota?').sort()).toEqual(['MN', 'SD'])
  })
  it('does not read the shorter name inside a longer one', () => {
    expect(findStates('West Virginia duck season')).toEqual(['WV'])
    expect(findStates('Arkansas mallards')).toEqual(['AR'])
  })
  it('does not read flyways and the Mississippi River as states', () => {
    expect(findStates('how is the Mississippi flyway looking?')).toEqual([])
    expect(findStates('birds on the Mississippi River near Quincy')).toEqual([])
    expect(findStates('Mississippi duck season dates')).toEqual(['MS'])
  })
  it('reads codes only where they cannot be an ordinary word', () => {
    expect(findStates('is it ok to shoot hens?')).toEqual([])
    expect(findStates('NE winds tomorrow, good for ducks?')).toEqual([])
    expect(findStates('ducks near Enid, OK')).toEqual(['OK'])
    expect(findStates('TX teal season')).toEqual(['TX'])
    expect(findStates('tx teal season')).toEqual(['TX'])
    expect(findStates('LA duck dates')).toEqual([])
    expect(findStates('Can I shoot cans in LA?')).toEqual(['LA'])
    expect(findStates('yes, ok, but where?')).toEqual([])
    expect(findStates('hunting is slow, in my view')).toEqual([])
  })
  it('still knows the Panhandle', () => {
    expect(findStates('snow geese in the texas panhandle')).toEqual(['TX'])
  })
})

describe('findTown without "near"', () => {
  it('finds a capitalized town of 10,000 or more anywhere', () => {
    expect(findTown('Amarillo snow geese this weekend?', [])).toMatchObject({ name: 'Amarillo', state: 'TX' })
    expect(findTown('Any ducks around Jonesboro lately', [])).toMatchObject({ name: 'Jonesboro', state: 'AR' })
    expect(findTown('Is Kansas City any good for geese', [])).toMatchObject({ name: 'Kansas City', state: 'MO' })
  })
  it('ignores small towns, lower case, and towns that are common words', () => {
    expect(findTown('amarillo snow geese', [])).toBeNull()
    expect(findTown('Mission accomplished, where next?', [])).toBeNull()
    expect(findTown('Normal bag limit for teal?', [])).toBeNull()
    expect(findTown('Snow Geese In Texas', [])).toBeNull()
  })
})
