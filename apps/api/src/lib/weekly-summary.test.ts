import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  biggestMoves, buildSiteFacts, describeChange, extractNumbers, pickSites, siteLine, stateNotes, templateSummary,
  misattributedNumbers, siteAliases, siteFact, summaryProblems, tidySummary, toSummaryCounts,
  unknownPlaces, unsupportedClaims, unsupportedNumbers, type Fact, type SummaryCount,
} from './weekly-summary.js'

const NOW = new Date('2026-11-19T12:00:00Z')

function count(over: Partial<SummaryCount>): SummaryCount {
  return {
    refugeId: 'a', refugeName: 'Site A', state: 'IL', speciesName: 'Mallard', count: 1000,
    surveyDate: '2026-11-10', previousCount: null, previousDate: null, ...over,
  }
}

const LDWF = 'Louisiana - LDWF Aerial Survey'
const ldwfAverage = {
  locationId: 'la', surveyDate: '2026-11-12', total: 686000, avgTotal: 1403368,
  surveysInAverage: 19, firstYear: 2004, lastYear: 2025,
}

describe('toSummaryCounts', () => {
  it('drops a previous survey too far back to compare, as the cards do', () => {
    const [c] = toSummaryCounts([{
      location_id: 'la', refuge_name: LDWF, state_code: 'LA', species_name: 'Blue-winged Teal',
      count: 259000, survey_date: '2026-11-12', previous_count: 73000, previous_date: '2026-09-10',
    }])
    expect(c.previousCount).toBeNull()
    expect(c.surveyDate).toBe('2026-11-12')
  })

  it('keeps a weekly previous survey', () => {
    const [c] = toSummaryCounts([{
      location_id: 'k', refuge_name: 'Keokuk', state_code: 'IL', species_name: 'Scaup',
      count: 34000, survey_date: new Date('2026-11-10T00:00:00Z'), previous_count: 205, previous_date: '2026-10-28',
    }])
    expect(c).toMatchObject({ previousCount: 205, previousDate: '2026-10-28', surveyDate: '2026-11-10' })
  })
})

describe('buildSiteFacts', () => {
  it('totals a site, keeps its top three species and the change over species with a previous survey', () => {
    const [s] = buildSiteFacts([
      count({ speciesName: 'Mallard', count: 5000, previousCount: 4000, previousDate: '2026-11-03' }),
      count({ speciesName: 'Gadwall', count: 3000, previousCount: 2000, previousDate: '2026-11-03' }),
      count({ speciesName: 'Pintail', count: 2000 }),
      count({ speciesName: 'Teal', count: 100 }),
    ], [], NOW)
    expect(s.totalBirds).toBe(10100)
    expect(s.topSpecies.map(t => t.name)).toEqual(['Mallard', 'Gadwall', 'Pintail'])
    expect(s.change).toEqual({ now: 8000, previous: 6000, previousDate: '2026-11-03' })
  })

  it('leaves out sites with nothing in the last four weeks', () => {
    expect(buildSiteFacts([count({ surveyDate: '2026-10-01' })], [], NOW)).toEqual([])
  })

  it('adds the long-term average only for the survey it belongs to', () => {
    const la = count({ refugeId: 'la', refugeName: LDWF, state: 'LA', count: 686000, surveyDate: '2026-11-12' })
    expect(buildSiteFacts([la], [ldwfAverage], NOW)[0].longTerm).toMatchObject({ percent: -51, surveys: 19 })
    expect(buildSiteFacts([la], [{ ...ldwfAverage, surveyDate: '2026-10-15' }], NOW)[0].longTerm).toBeNull()
  })

  it('orders sites by birds', () => {
    const facts = buildSiteFacts([
      count({ refugeId: 'a', count: 100 }),
      count({ refugeId: 'b', refugeName: 'Site B', count: 900 }),
    ], [], NOW)
    expect(facts.map(f => f.refugeId)).toEqual(['b', 'a'])
  })
})

describe('pickSites', () => {
  it("keeps each state's largest site before filling up by size", () => {
    const sites = buildSiteFacts([
      count({ refugeId: 'il1', count: 9000 }),
      count({ refugeId: 'il2', count: 8000 }),
      count({ refugeId: 'il3', count: 7000 }),
      count({ refugeId: 'tx1', state: 'TX', count: 100 }),
      count({ refugeId: 'tx2', state: 'TX', count: 50 }),
    ], [], NOW)
    expect(pickSites(sites, 3).map(s => s.refugeId)).toEqual(['il1', 'il2', 'tx1'])
  })
})

describe('describeChange', () => {
  it('gives no percentage from a small base', () => {
    expect(describeChange({ now: 34000, previous: 205, previousDate: '2026-10-28' }))
      .toBe('up from 205 on Oct 28 (too few birds then for a percentage)')
  })

  it('gives a dated percentage from a real base', () => {
    expect(describeChange({ now: 14100, previous: 10000, previousDate: '2026-11-03' }))
      .toBe('up 41% since Nov 3 (from 10,000)')
    expect(describeChange({ now: 10200, previous: 10000, previousDate: '2026-11-03' }))
      .toBe('about the same as Nov 3 (10,000)')
  })

  it('says a very large rise as a multiple', () => {
    expect(describeChange({ now: 33525, previous: 2320, previousDate: '2026-10-28' }))
      .toBe('about 14 times the 2,320 counted Oct 28')
  })
})

describe('biggestMoves', () => {
  it('ranks by birds gained or lost, not by percentage', () => {
    const sites = buildSiteFacts([
      count({ refugeId: 'small', refugeName: 'Cuivre', count: 33525, previousCount: 2320, previousDate: '2026-10-28' }),
      count({ refugeId: 'big', refugeName: 'Dardenne', count: 141155, previousCount: 74100, previousDate: '2026-10-28' }),
      count({ refugeId: 'drop', refugeName: 'Loess', state: 'MO', count: 102989, previousCount: 109138, previousDate: '2026-11-03' }),
    ], [], NOW)
    expect(biggestMoves(sites, 2)).toEqual([
      'Dardenne (IL): 67,055 more birds than Oct 28',
      'Cuivre (IL): 31,205 more birds than Oct 28',
    ])
  })
})

describe('stateNotes', () => {
  const site = (state: string, refugeName = 'Some refuge') =>
    buildSiteFacts([count({ refugeId: state + refugeName, state, refugeName })], [], NOW)[0]

  it('flags states counted at sites only, and states waiting on their statewide survey', () => {
    expect(stateNotes([site('IL'), site('TX'), site('LA', LDWF)])).toEqual([
      'IL: site counts only (one site), not a statewide survey.',
      'TX: waiting for the midwinter survey; these are one site, not the whole state.',
    ])
  })

  it('flags Arkansas only while its AGFC survey is missing', () => {
    expect(stateNotes([site('AR')])).toHaveLength(1)
    expect(stateNotes([site('AR'), site('AR', 'Arkansas - AGFC Aerial Survey')])).toEqual([])
  })
})

describe('the number check', () => {
  const la = buildSiteFacts([
    count({ refugeId: 'la', refugeName: LDWF, state: 'LA', count: 686000, surveyDate: '2026-11-12', speciesName: 'Gadwall' }),
    count({ refugeId: 'k', refugeName: 'Keokuk', count: 34000, speciesName: 'Scaup', previousCount: 205, previousDate: '2026-10-28' }),
  ], [ldwfAverage], NOW)
  const facts = la.map(siteLine).join('\n')

  it('reads numbers with commas, decimals and units', () => {
    expect(extractNumbers('34,000 scaup, 1.4 million ducks, 51% below, 2/3')).toEqual([34000, 1400000, 51, 2, 3])
  })

  it('passes numbers taken from the facts, rounded or not', () => {
    expect(unsupportedNumbers(
      'Louisiana counted 686,000 ducks on Nov 12, 51% below the November average of 1.4 million (19 surveys, 2004-2025). Keokuk scaup rose to 34,000 from 205 on Oct 28.',
      facts,
    )).toEqual([])
  })

  it('catches the percentage the old summary made up, and invented sums', () => {
    expect(unsupportedNumbers('a 16485% increase in scaup', facts)).toEqual([16485])
    expect(unsupportedNumbers('together 720,000 birds', facts)).toEqual([720000])
  })

  it('lets small numbers through', () => {
    expect(unsupportedNumbers('two sites, push score 2 of 3, next 3 days', facts)).toEqual([])
  })
})

describe('unsupportedClaims', () => {
  const refuge = buildSiteFacts([count({})], [], NOW)
  const la = buildSiteFacts([count({ refugeId: 'la', count: 686000, surveyDate: '2026-11-12' })], [ldwfAverage], NOW)

  it('rejects a long-term average when no site has one', () => {
    expect(unsupportedClaims('These refuges are below their long-term averages.', refuge)).toHaveLength(1)
    expect(unsupportedClaims('Louisiana is 51% below the November average.', la)).toEqual([])
    expect(unsupportedClaims('Counts rose at Site A.', refuge)).toEqual([])
  })
})

describe('tidySummary', () => {
  it('removes sentences about having no advice to give, and nothing else', () => {
    expect(tidySummary('Counts rose at Swan Lake. No hunting advice is given this week as the push scores are below 2 in all states. eBird reports rose.'))
      .toBe('Counts rose at Swan Lake. eBird reports rose.')
    expect(tidySummary('With push scores of 0 and 0.5, there is no hunting advice to offer at this time.')).toBe('')
    expect(tidySummary('A cold front pushes into Kansas. Hunt the north side of Cheyenne Bottoms.'))
      .toBe('A cold front pushes into Kansas. Hunt the north side of Cheyenne Bottoms.')
  })

  it('removes filler: no number and nothing moving', () => {
    expect(tidySummary('Loess Bluffs has 102,989 birds. The current count at Loess Bluffs is notable, as it provides a snapshot of the waterfowl population at this specific site.'))
      .toBe('Loess Bluffs has 102,989 birds.')
    expect(tidySummary('eBird reports show waterfowl being seen at various locations.')).toBe('')
    expect(tidySummary('Pintail numbers are building at Swan Lake.')).toBe('Pintail numbers are building at Swan Lake.')
  })

  it('keeps paragraphs and names with abbreviations whole', () => {
    expect(tidySummary('Long Lake (St. Charles Co.) is up 333% since Oct 28.\n\nLouisiana is 51% below average.'))
      .toBe('Long Lake (St. Charles Co.) is up 333% since Oct 28.\n\nLouisiana is 51% below average.')
  })
})

describe('numbers in context', () => {
  const sites = buildSiteFacts([
    count({ refugeId: 'h', refugeName: 'Hagerman National Wildlife Refuge', state: 'TX', count: 1029, previousCount: 327, previousDate: '2026-11-03' }),
    count({ refugeId: 'l', refugeName: 'Loess Bluffs National Wildlife Refuge', state: 'MO', count: 102989 }),
    count({ refugeId: 's', refugeName: 'Swan Lake (Two Rivers NWR) - Mississippi River (INHS)', state: 'IL', count: 106295 }),
  ], [], NOW)
  const facts: Fact[] = [
    ...sites.map(siteFact),
    { kind: 'ebird', state: 'TX', text: '- TX: waterfowl reported at 4332 places in the last 14 days, +72% vs two weeks earlier' },
  ]

  it('accepts a number used for its own site, by any of its names', () => {
    expect(misattributedNumbers('Hagerman NWR counted 1,029 birds.', facts)).toEqual([])
    expect(misattributedNumbers('Swan Lake held 106,295 birds and Loess Bluffs 102,989.', facts)).toEqual([])
    expect(misattributedNumbers('Missouri: 102,989 birds at one refuge.', facts)).toEqual([])
  })

  it("rejects one site's number given to another", () => {
    expect(misattributedNumbers('Hagerman NWR counted 102,989 birds.', facts)).toHaveLength(1)
  })

  it('keeps eBird numbers to sentences about birder reports', () => {
    expect(misattributedNumbers('Texas had 4,332 birds at Hagerman.', facts)).toHaveLength(1)
    expect(misattributedNumbers('Birders reported waterfowl at 4,332 places in Texas.', facts)).toEqual([])
  })

  it('holds a sentence that names nothing to the plain check only', () => {
    expect(misattributedNumbers('Elsewhere, counts reached 102,989.', facts)).toEqual([])
  })
})

describe('siteAliases', () => {
  it('gives the short names a reader uses', () => {
    expect(siteAliases('Swan Lake (Two Rivers NWR) - Mississippi River (INHS)')).toContain('swan lake')
    expect(siteAliases('Loess Bluffs National Wildlife Refuge')).toEqual(expect.arrayContaining(['loess bluffs nwr', 'loess bluffs']))
  })
})

describe('unknownPlaces', () => {
  const factsText = '- Keokuk to Nauvoo - Mississippi River (INHS) (IL): 75,450 birds\n- Loess Bluffs National Wildlife Refuge (MO): 102,989 birds\n- Cuba Island - Illinois River (INHS) (IL)'

  it('catches the place the old summary invented', () => {
    expect(unknownPlaces('Hunters should focus on the Mississippi River delta.', factsText)).toEqual(['Mississippi River delta'])
    expect(unknownPlaces('Birds are stacking up on the Gulf Coast.', factsText)).toEqual(['Gulf Coast'])
  })

  it('allows places in the facts, their short forms, and states', () => {
    expect(unknownPlaces('Along the Mississippi River, Keokuk to Nauvoo rose. Loess Bluffs NWR held steady. Cuba Island too.', factsText)).toEqual([])
    expect(unknownPlaces('Louisiana and Missouri counts rose.', factsText)).toEqual([])
  })

  it('ignores capitalized words that are not places', () => {
    expect(unknownPlaces('Northern Pintail and Greater White-fronted Goose led the November count.', factsText)).toEqual([])
  })
})

describe('summaryProblems', () => {
  it('collects every kind of problem, and passes a clean draft', () => {
    const sites = buildSiteFacts([count({ refugeName: 'Swan Lake', count: 106295 })], [], NOW)
    const facts = sites.map(siteFact)
    const text = facts.map(f => f.text).join('\n')
    expect(summaryProblems('Swan Lake held 106,295 birds.', text, facts, sites)).toEqual([])
    expect(summaryProblems('', text, facts, sites)).toEqual(['an empty draft'])
    const bad = summaryProblems('Swan Lake held 900,000 birds, above its long-term average, as did Reelfoot Lake.', text, facts, sites)
    expect(bad).toHaveLength(3)
  })
})

// The summary repeats three of the Migration page's card rules, since the API can't import web
// code. If the web app changes one, this fails until the copy here is changed to match.
describe('card rules match the web app', () => {
  const web = (f: string) => readFileSync(resolve(import.meta.dirname, '../../../web/src/lib', f), 'utf-8')
  const api = readFileSync(resolve(import.meta.dirname, 'weekly-summary.ts'), 'utf-8')
  const block = (src: string, start: RegExp) => {
    const m = src.match(start)
    if (!m || m.index === undefined) throw new Error(`not found: ${start}`)
    let depth = 0
    for (let i = src.indexOf('{', m.index + m[0].length - 1); i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}' && --depth === 0) return src.slice(m.index + m[0].length, i + 1)
    }
    throw new Error('unclosed')
  }
  const bare = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\s+/g, '')

  it('STATEWIDE_SURVEY', () => {
    const re = /const STATEWIDE_SURVEY[^=]*=/
    expect(bare(block(api, re))).toBe(bare(block(web('migrationGroups.ts'), re)))
  })

  it('SITE_COUNTS_ONLY', () => {
    const line = (s: string) => bare(s.match(/const SITE_COUNTS_ONLY = new Set\(\[[^\]]*\]\)/)![0])
    expect(line(api)).toBe(line(web('migrationGroups.ts')))
  })

  it('staleThresholdFor', () => {
    const re = /function staleThresholdFor\(now: Date\): Date /
    expect(bare(block(api, re))).toBe(bare(block(web('migrationStats.ts'), re)))
  })
})

describe('templateSummary', () => {
  it('writes the facts out plainly, with the state notes', () => {
    const sites = buildSiteFacts([
      count({ refugeId: 'la', refugeName: LDWF, state: 'LA', count: 686000, surveyDate: '2026-11-12' }),
      count({ refugeId: 'tx', refugeName: 'Anahuac', state: 'TX', count: 1200 }),
    ], [ldwfAverage], NOW)
    const text = templateSummary(sites, stateNotes(sites))
    expect(text).toContain('Louisiana - LDWF Aerial Survey counted 686,000 birds on Nov 12')
    expect(text).toContain('51% below the November average of 1,403,368')
    expect(text).toContain('TX: waiting for the midwinter survey')
  })

  it('says so when nothing is current', () => {
    expect(templateSummary([], [])).toMatch(/No current survey counts/)
  })
})
