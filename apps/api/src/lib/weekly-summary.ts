// The facts the weekly migration summary is written from, and the check its text must pass.
//
// The model used to get the 25 largest single-species counts of the last 30 days, each compared
// with whatever survey came before it, as "+X%" with no date. It wrote "a 16485% increase" for
// Keokuk–Nauvoo scaup (205 birds on Oct 28, 34,000 on Nov 10), called Louisiana "building" while
// the card under it read 51% below the November average, and named a "Mississippi River delta"
// that was in none of its data. So the arithmetic is done here, per site, by the rules the
// Migration page's cards use, and every number in the model's text has to come from these facts.
//
// The card rules live in apps/web/src/lib/migrationGroups.ts and migrationStats.ts (stale window,
// site totals, partial-count notes). The API can't import the web app's code, so the few rules
// the summary needs are repeated here; change them in both places.

import { surveyChange } from './survey-change.js'
import type { SurveyAverage } from './survey-data.js'

export interface SummaryCount {
  refugeId: string
  refugeName: string
  state: string
  speciesName: string
  count: number
  /** YYYY-MM-DD */
  surveyDate: string
  previousCount: number | null
  previousDate: string | null
}

export interface SiteFact {
  refugeId: string
  refugeName: string
  state: string
  latestDate: string
  totalBirds: number
  topSpecies: Array<{ name: string; count: number }>
  /** Birds now against the previous survey, over the species that have one (same rule as the cards) */
  change: { now: number; previous: number; previousDate: string } | null
  longTerm: { avgTotal: number; surveys: number; firstYear: number; lastYear: number; percent: number } | null
}

/** Below this many birds in the earlier survey, a percentage says more about the base than the birds */
export const MIN_BASE_FOR_PERCENT = 1000
/** The most sites the model is shown; the rest are small */
export const MAX_SITES = 15

/** Same window as the cards (migrationStats.ts staleThresholdFor): Feb 1 off-season, 4 weeks in season */
export function staleThresholdFor(now: Date): Date {
  const month = now.getMonth()
  if (month >= 2 && month <= 7) return new Date(now.getFullYear(), 1, 1)
  return new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)
}

/** States with a statewide survey the cards wait on, and its own site (migrationGroups.ts STATEWIDE_SURVEY) */
const STATEWIDE_SURVEY: Record<string, { survey: string; site?: string }> = {
  TX: { survey: 'midwinter survey' },
  OK: { survey: 'midwinter survey' },
  KS: { survey: 'midwinter survey' },
  NM: { survey: 'midwinter survey' },
  AR: { survey: 'AGFC aerial survey', site: 'Arkansas - AGFC Aerial Survey' },
  LA: { survey: 'LDWF aerial survey', site: 'Louisiana - LDWF Aerial Survey' },
}
const SITE_COUNTS_ONLY = new Set(['IL', 'MO', 'IA'])

/** Turn the dashboard's raw rows into summary counts, judging each previous survey as the cards do */
export function toSummaryCounts(rows: Array<Record<string, unknown>>): SummaryCount[] {
  return rows.map(r => {
    const count = Number(r.count)
    const change = surveyChange(count, r.survey_date as string | Date,
      r.previous_count as number | null, r.previous_date as string | Date | null)
    return {
      refugeId: String(r.location_id),
      refugeName: String(r.refuge_name),
      state: String(r.state_code),
      speciesName: String(r.species_name),
      count,
      surveyDate: isoDay(r.survey_date as string | Date),
      previousCount: change.previousCount,
      previousDate: change.previousDate,
    }
  })
}

function isoDay(d: string | Date): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
}

/** One fact per current site, largest first. Stale sites are left out: the summary is about now. */
export function buildSiteFacts(counts: SummaryCount[], averages: SurveyAverage[], now = new Date()): SiteFact[] {
  const threshold = isoDay(staleThresholdFor(now))
  const bySite = new Map<string, SummaryCount[]>()
  for (const c of counts) {
    if (c.surveyDate < threshold || !(c.count > 0)) continue
    const arr = bySite.get(c.refugeId) ?? []
    arr.push(c)
    bySite.set(c.refugeId, arr)
  }
  const facts: SiteFact[] = []
  for (const [refugeId, items] of bySite) {
    const latestDate = items.reduce((d, c) => c.surveyDate > d ? c.surveyDate : d, items[0].surveyDate)
    const totalBirds = items.reduce((s, c) => s + c.count, 0)
    const topSpecies = [...items].sort((a, b) => b.count - a.count).slice(0, 3)
      .map(c => ({ name: c.speciesName, count: c.count }))
    let now_ = 0
    let previous = 0
    let previousDate: string | null = null
    for (const c of items) {
      if (c.previousCount === null || !c.previousDate) continue
      now_ += c.count
      previous += c.previousCount
      if (!previousDate || c.previousDate > previousDate) previousDate = c.previousDate
    }
    const change = previous > 0 && previousDate ? { now: now_, previous, previousDate } : null
    const a = averages.find(x => x.locationId === refugeId && x.surveyDate === latestDate && x.avgTotal > 0)
    const longTerm = a
      ? { avgTotal: a.avgTotal, surveys: a.surveysInAverage, firstYear: a.firstYear, lastYear: a.lastYear,
          percent: Math.round(((a.total - a.avgTotal) / a.avgTotal) * 100) }
      : null
    facts.push({ refugeId, refugeName: items[0].refugeName, state: items[0].state, latestDate, totalBirds, topSpecies, change, longTerm })
  }
  return facts.sort((a, b) => b.totalBirds - a.totalBirds)
}

/**
 * The sites the model is shown: each state's largest first, so a state with small counts
 * (Texas's one refuge) isn't crowded out by Illinois's 37 river sites, then the largest of
 * the rest, up to `max`. Returned largest first.
 */
export function pickSites(sites: SiteFact[], max = MAX_SITES): SiteFact[] {
  const picked = new Set<SiteFact>()
  for (const s of sites) {
    if (picked.size >= max) break
    if (![...picked].some(p => p.state === s.state)) picked.add(s)
  }
  for (const s of sites) {
    if (picked.size >= max) break
    picked.add(s)
  }
  return sites.filter(s => picked.has(s))
}

/** Why a state's sites don't add up to the state (migrationGroups.ts partialCountNote) */
export function stateNotes(sites: SiteFact[]): string[] {
  const notes: string[] = []
  for (const state of [...new Set(sites.map(s => s.state))].sort()) {
    const n = sites.filter(s => s.state === state).length
    const where = n === 1 ? 'one site' : `${n} sites`
    if (SITE_COUNTS_ONLY.has(state)) {
      notes.push(`${state}: site counts only (${where}), not a statewide survey.`)
      continue
    }
    const s = STATEWIDE_SURVEY[state]
    if (s && !(s.site && sites.some(x => x.state === state && x.refugeName === s.site))) {
      notes.push(`${state}: waiting for the ${s.survey}; these are ${where}, not the whole state.`)
    }
  }
  return notes
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']

export function shortDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
}

function n(x: number): string {
  return x.toLocaleString('en-US')
}

/** "up 41% since Nov 3 (from 12,000)", or for a small base "up from 205 on Oct 28" */
export function describeChange(c: NonNullable<SiteFact['change']>): string {
  const since = shortDate(c.previousDate)
  if (c.previous < MIN_BASE_FOR_PERCENT) {
    if (c.now === c.previous) return `unchanged since ${since}`
    return `${c.now > c.previous ? 'up' : 'down'} from ${n(c.previous)} on ${since} (too few birds then for a percentage)`
  }
  const pct = Math.round(((c.now - c.previous) / c.previous) * 100)
  if (Math.abs(pct) < 5) return `about the same as ${since} (${n(c.previous)})`
  // "up 1281%" reads as an event; "about 14 times" is the same fact at its real size
  if (pct > MAX_PERCENT) return `about ${Math.round(c.now / c.previous)} times the ${n(c.previous)} counted ${since}`
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% since ${since} (from ${n(c.previous)})`
}

/** Above this, a rise is said as a multiple */
export const MAX_PERCENT = 200

/**
 * The sites where the most birds came or went, by number of birds, not percentage: a site going
 * from 2,320 to 33,525 is a smaller movement than one going from 74,100 to 141,155.
 */
export function biggestMoves(sites: SiteFact[], max = 3): string[] {
  return sites
    .filter(s => s.change && s.change.now !== s.change.previous)
    .sort((a, b) => Math.abs(b.change!.now - b.change!.previous) - Math.abs(a.change!.now - a.change!.previous))
    .slice(0, max)
    .map(s => {
      const d = s.change!.now - s.change!.previous
      return `${s.refugeName} (${s.state}): ${n(Math.abs(d))} ${d > 0 ? 'more' : 'fewer'} birds than ${shortDate(s.change!.previousDate)}`
    })
}

export function describeLongTerm(l: NonNullable<SiteFact['longTerm']>, latestDate: string): string {
  const month = MONTH_NAMES[Number(latestDate.slice(5, 7)) - 1]
  const vs = Math.abs(l.percent) < 10 ? 'about the same as' : `${Math.abs(l.percent)}% ${l.percent > 0 ? 'above' : 'below'}`
  return `${vs} the ${month} average of ${n(l.avgTotal)} (${l.surveys} surveys, ${l.firstYear}-${l.lastYear})`
}

/** One line per site, every number already worked out */
export function siteLine(s: SiteFact): string {
  const parts = [`${s.refugeName} (${s.state}), surveyed ${shortDate(s.latestDate)}: ${n(s.totalBirds)} birds`]
  parts.push(s.change ? describeChange(s.change) : 'no recent earlier survey to compare')
  if (s.longTerm) parts.push(describeLongTerm(s.longTerm, s.latestDate))
  parts.push(`most counted: ${s.topSpecies.map(t => `${t.name} ${n(t.count)}`).join(', ')}`)
  return `- ${parts.join('; ')}`
}

// ─── The number check ─────────────────────────────────────────────────────────

/** Numbers written in text: "34,000", "1.4 million", "51%", "205", "2/3" (both sides) */
export function extractNumbers(text: string): number[] {
  const out: number[] = []
  const re = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s*(?:million|thousand)\b)?/gi
  for (const m of text.matchAll(re)) {
    let v = Number(m[1].replace(/,/g, ''))
    const unit = m[2]?.trim().toLowerCase()
    if (unit === 'million') v *= 1_000_000
    else if (unit === 'thousand') v *= 1_000
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}

/**
 * Numbers in `summary` that appear nowhere in `facts`. Rounding is allowed (1.4 million for
 * 1,403,368; "about 690,000" for 686,000: within 3%), and numbers up to 10 always pass ("two
 * sites", "next 3 days", push score 2). A number the model worked out itself, such as a sum or
 * its own percentage, fails: the facts already hold every number worth saying.
 */
export function unsupportedNumbers(summary: string, facts: string): number[] {
  const known = extractNumbers(facts)
  return extractNumbers(summary).filter(v =>
    v > 10 && !known.some(k => Math.abs(v - k) <= Math.max(0.03 * k, 0.5)))
}

/**
 * Claims the facts can't back. Today one: a long-term average when no site has one (the model
 * wrote "below their long-term averages" of two refuges that have none).
 */
export function unsupportedClaims(summary: string, sites: SiteFact[]): string[] {
  const problems: string[] = []
  if (/\baverage|long[- ]term|historic|normal for/i.test(summary) && !sites.some(s => s.longTerm)) {
    problems.push('a long-term average (no site in the facts has one)')
  }
  return problems
}

// ─── Numbers in context ───────────────────────────────────────────────────────

/** One line of the facts, with what it is about: a number is only good for claims about its subject */
export interface Fact {
  kind: 'survey' | 'ebird' | 'weather'
  state: string
  /** The survey site, for survey lines */
  site?: string
  text: string
}

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AR: 'Arkansas', CA: 'California', CO: 'Colorado', FL: 'Florida', GA: 'Georgia',
  IA: 'Iowa', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi', MT: 'Montana',
  ND: 'North Dakota', NE: 'Nebraska', NM: 'New Mexico', NV: 'Nevada', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', WA: 'Washington', WI: 'Wisconsin',
  WY: 'Wyoming',
}

export function siteFact(s: SiteFact): Fact {
  return { kind: 'survey', state: s.state, site: s.refugeName, text: siteLine(s) }
}

export function moveFacts(sites: SiteFact[], max = 3): Fact[] {
  const lines = biggestMoves(sites, max)
  return sites
    .filter(s => s.change && s.change.now !== s.change.previous)
    .sort((a, b) => Math.abs(b.change!.now - b.change!.previous) - Math.abs(a.change!.now - a.change!.previous))
    .slice(0, max)
    .map((s, i) => ({ kind: 'survey' as const, state: s.state, site: s.refugeName, text: `- ${lines[i]}` }))
}

/** "national wildlife refuge" and "NWR" are the same name to a reader */
function normalizePlace(text: string): string {
  return text.toLowerCase().replace(/national wildlife refuge/g, 'nwr').replace(/\s+/g, ' ')
}

/**
 * The ways a sentence names a survey site: "Swan Lake (Two Rivers NWR) - Mississippi River (INHS)"
 * is written "Swan Lake"; "Loess Bluffs National Wildlife Refuge" may be "Loess Bluffs NWR" or
 * "Loess Bluffs".
 */
export function siteAliases(name: string): string[] {
  const full = normalizePlace(name)
  const head = full.split(' - ')[0]
  const out = new Set([full, head, head.split(' (')[0], head.replace(/\s+nwr$/, ''), head.split(',')[0]])
  return [...out].map(a => a.trim()).filter(a => a.length >= 4)
}

/** Split into sentences without breaking "St. Charles Co." or "Nov. 3" */
function sentences(text: string): string[] {
  return text.split(/(?<!\b(?:St|Co|Mt|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|No)\.)(?<=[.!?])\s+/)
}

function near(v: number, k: number): boolean {
  return Math.abs(v - k) <= Math.max(0.03 * k, 0.5)
}

const EBIRD_WORDS = /ebird|birders?\b|sightings?|reported|spotted|places\b|locations\b/i

/**
 * Numbers that are in the facts, but not the facts about what the sentence is about. A sentence
 * naming a site or a state may only use numbers from that site's or state's lines, and only a
 * sentence about birder reports may use the eBird lines' numbers ("4,332 places in Texas" must
 * not become "4,332 birds at Hagerman"). A sentence that names nothing is held to the plain check.
 */
export function misattributedNumbers(summary: string, facts: Fact[]): string[] {
  const problems: string[] = []
  const sites = [...new Set(facts.filter(f => f.site).map(f => f.site!))]
  for (const sentence of sentences(summary)) {
    const lower = normalizePlace(sentence)
    const namedSites = sites.filter(s => siteAliases(s).some(a => lower.includes(a)))
    const namedStates = new Set(Object.entries(STATE_NAMES)
      .filter(([code, name]) => lower.includes(name.toLowerCase()) || new RegExp(`\\b${code}\\b`).test(sentence))
      .map(([code]) => code))
    // A site named in full can contain a state's name ("Louisiana - LDWF Aerial Survey"): fine
    const aboutEbird = EBIRD_WORDS.test(sentence)
    for (const v of extractNumbers(sentence)) {
      if (v <= 10) continue
      const holders = facts.filter(f => extractNumbers(f.text).some(k => near(v, k)))
      if (holders.length === 0) continue // unsupportedNumbers reports it
      const usable = holders.filter(f => f.kind !== 'ebird' || aboutEbird)
      const named = namedSites.length > 0 || namedStates.size > 0
      const fits = usable.filter(f => !named || (f.site && namedSites.includes(f.site)) || namedStates.has(f.state))
      if (fits.length === 0) {
        const from = holders[0].site ?? `${holders[0].state} ${holders[0].kind === 'ebird' ? 'eBird reports' : holders[0].kind}`
        problems.push(`${v.toLocaleString('en-US')} is a number for ${from}, not for what that sentence describes`)
      }
    }
  }
  return problems
}

// ─── Place names ──────────────────────────────────────────────────────────────

const PLACE_NOUNS = new Set(['lake', 'lakes', 'river', 'rivers', 'refuge', 'nwr', 'delta', 'bay', 'marsh',
  'marshes', 'county', 'parish', 'island', 'bottoms', 'bluffs', 'club', 'area', 'reservoir', 'basin',
  'valley', 'creek', 'slough', 'pool', 'division', 'coast', 'prairie', 'panhandle', 'plains', 'wma', 'sound',
  'bayou', 'wetlands', 'flats', 'region'])
const LEAD_WORDS = new Set(['the', 'at', 'in', 'on', 'near', 'along', 'from', 'of', 'and', 'while', 'with',
  'across', 'around', 'both', 'meanwhile', 'further', 'south', 'north', 'east', 'west', 'central'])

/**
 * Place names in the text that the facts don't contain: the model wrote "the Mississippi River
 * delta" from data that had only INHS river sites. A place is a run of capitalized words ending
 * in, or followed by, a place word (Lake, River, Delta, NWR...); state names are always allowed.
 */
export function unknownPlaces(summary: string, factsText: string): string[] {
  const facts = normalizePlace(factsText)
  const stateNames = new Set(Object.values(STATE_NAMES).map(s => s.toLowerCase()))
  const found = new Set<string>()
  // A place name never runs across punctuation: "the Mississippi River, Keokuk to Nauvoo" is two
  for (const chunk of sentences(summary).flatMap(s => s.split(/[,;:()]|\.(?=\s|$)/))) {
    const words = chunk.replace(/["'’]/g, ' ').split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i++) {
      if (!/^[A-Z]/.test(words[i])) continue
      let j = i
      while (j < words.length && /^[A-Z]/.test(words[j])) j++
      while (j < words.length && PLACE_NOUNS.has(words[j].toLowerCase())) j++ // "River delta"
      let run = words.slice(i, j)
      while (run.length && LEAD_WORDS.has(run[0].toLowerCase())) run = run.slice(1)
      i = j
      if (!run.some(w => PLACE_NOUNS.has(w.toLowerCase()))) continue
      const place = normalizePlace(run.join(' '))
      if (stateNames.has(place) || facts.includes(place)) continue
      found.add(run.join(' '))
    }
  }
  return [...found]
}

// ─── Tidying ──────────────────────────────────────────────────────────────────

const SAYS_SOMETHING = /\d|\b(up|down|more|fewer|rose|rise|rising|fell|fall|falling|increas\w*|decreas\w*|declin\w*|drop\w*|jump\w*|doubl\w*|tripl\w*|times|below|above|higher|lower|most|largest|biggest|front|winds?|freez\w*|cold|push|arriv\w*|left|leaving|build\w*|peak\w*|gone|steady|unchanged|same|hunt\w*)\b/i

/**
 * Drop sentences that say nothing, keeping paragraphs:
 * - about the summary's own rules ("No hunting advice is given this week as the push scores are
 *   below 2"): the prompt forbids them and Llama 3.3 writes them anyway;
 * - filler with no number and no movement ("The current count at Loess Bluffs is notable, as it
 *   provides a snapshot of the waterfowl population at this specific site.").
 */
export function tidySummary(summary: string): string {
  return summary
    .split(/\n\s*\n|\n/)
    .map(p => sentences(p.trim())
      .filter(s => s && !/\b(no|not)\b[^.]*\badvice\b|\badvice\b[^.]*\b(no|not|none)\b/i.test(s))
      .filter(s => SAYS_SOMETHING.test(s))
      .join(' '))
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

/**
 * Everything wrong with a draft, in words the model is shown on its retry. Empty means publish.
 * `factsText` is the whole prompt's facts (state notes included); `facts` the lines with subjects.
 */
export function summaryProblems(text: string, factsText: string, facts: Fact[], sites: SiteFact[]): string[] {
  if (!text) return ['an empty draft']
  return [
    ...unsupportedNumbers(text, factsText).map(v => `the number ${v.toLocaleString('en-US')}, which is not in the facts`),
    ...misattributedNumbers(text, facts),
    ...unsupportedClaims(text, sites),
    ...unknownPlaces(text, factsText).map(p => `the place "${p}", which is not in the facts`),
  ]
}

// ─── The fallback ─────────────────────────────────────────────────────────────

/** The summary written from the facts alone, when the model's text fails the check twice */
export function templateSummary(sites: SiteFact[], notes: string[]): string {
  if (sites.length === 0) {
    return 'No current survey counts. Check back after the next refuge surveys are processed.'
  }
  const top = sites.slice(0, 4).map(s => {
    const parts = [`${s.refugeName} counted ${n(s.totalBirds)} birds on ${shortDate(s.latestDate)}`]
    if (s.change) parts.push(describeChange(s.change))
    if (s.longTerm) parts.push(describeLongTerm(s.longTerm, s.latestDate))
    return parts.join(', ') + '.'
  })
  const moved = sites.filter(s => s.change && s.change.previous >= MIN_BASE_FOR_PERCENT)
    .map(s => ({ s, pct: Math.round(((s.change!.now - s.change!.previous) / s.change!.previous) * 100) }))
    .filter(x => Math.abs(x.pct) >= 30 && !sites.slice(0, 4).includes(x.s))
    .slice(0, 3)
    .map(x => `${x.s.refugeName} is ${describeChange(x.s.change!)}.`)
  const caveat = notes.length ? ` ${notes.join(' ')}` : ''
  return `${top.join(' ')}${moved.length ? ' ' + moved.join(' ') : ''}${caveat}`
}
