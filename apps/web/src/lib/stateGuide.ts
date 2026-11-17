/**
 * State hunting guides (/duck-hunting/<state>): one page per state with this season's
 * waterfowl dates and limits and the latest bird counts.
 *
 * Two things render a guide from what this file builds:
 *   - the StateGuidePage React page, from live API data, and
 *   - the build step in apps/web/prerender/statePages.ts, which writes a real HTML file per
 *     state into dist so search engines see the content without running JavaScript.
 * Both go through buildGuide, so the numbers can't drift apart. Keep this file free of
 * import.meta and browser globals: vite.config.ts imports it at build time, in Node.
 */

import { parseCalendarDate } from './dates'
import { enrichCounts, groupRefuges, groupStates, sortCounts } from './migrationGroups'

export const GUIDE_BASE = '/duck-hunting'

/** States with season data. Order is the index page's order. */
export const GUIDE_STATES = [
  { code: 'AR', name: 'Arkansas', slug: 'arkansas' },
  { code: 'IL', name: 'Illinois', slug: 'illinois' },
  { code: 'IA', name: 'Iowa', slug: 'iowa' },
  { code: 'KS', name: 'Kansas', slug: 'kansas' },
  { code: 'LA', name: 'Louisiana', slug: 'louisiana' },
  { code: 'MO', name: 'Missouri', slug: 'missouri' },
  { code: 'NM', name: 'New Mexico', slug: 'new-mexico' },
  { code: 'OK', name: 'Oklahoma', slug: 'oklahoma' },
  { code: 'TX', name: 'Texas', slug: 'texas' },
] as const

export type GuideState = (typeof GUIDE_STATES)[number]

export function guideStateBySlug(slug: string | undefined): GuideState | undefined {
  return GUIDE_STATES.find(s => s.slug === slug?.toLowerCase())
}

export function guidePath(state: GuideState): string {
  return `${GUIDE_BASE}/${state.slug}`
}

/** The fall-start year of the season in play: July onward is this year's season. */
export function guideSeasonYear(now: Date): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

export function seasonLabel(year: number): string {
  return `${year}–${String((year + 1) % 100).padStart(2, '0')}`
}

// ─── Inputs (the API's shapes, only the fields used) ──────────────────────────

export type SeasonInput = {
  name: string
  seasonType: string | null
  startDate: string
  endDate: string
  bagLimit: unknown
  units: unknown
  sourceUrl: string | null
}

export type StateInfoInput = {
  code: string
  name: string
  agencyName: string | null
  agencyUrl: string | null
  regulationsUrl: string | null
}

type CountInput = {
  refugeId: string
  refugeName: string
  state: string
  flyway: string | null
  species: string
  speciesName: string
  count: number
  surveyDate: string
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
  deltaPercent: number | null
  previousCount: number | null
  source?: string
}

export type DashboardInput = {
  currentCounts: CountInput[]
  ebirdCounts: CountInput[]
}

// ─── Output ────────────────────────────────────────────────────────────────────

export type GuideCategory = 'Ducks' | 'Geese' | 'Youth and veterans days' | 'Light goose conservation order'

export type GuideRow = {
  /** "Regular Duck Season", "Light Geese", "Scaup (first 15 days)" */
  name: string
  /** "North Zone", "Statewide" */
  zone: string
  /** Calendar dates, YYYY-MM-DD, in date order; splits are separate ranges */
  ranges: Array<{ start: string; end: string }>
  daily: number | null
  possession: number | null
  openToday: boolean
}

export type GuideSite = {
  name: string
  total: number
  latestDate: string
  /** True when the site's numbers are birder reports from eBird, not a survey */
  ebird: boolean
}

export type Guide = {
  state: GuideState
  agencyName: string | null
  agencyUrl: string | null
  regulationsUrl: string | null
  seasonYear: number
  /** YYYY-MM-DD the guide describes (dates "open today" are judged against) */
  asOf: string
  sections: Array<{ category: GuideCategory; rows: GuideRow[] }>
  sourceUrl: string | null
  counts: {
    totalBirds: number
    siteCount: number
    latestDate: string
    /** No count in the last weeks: the numbers are from earlier surveys */
    allStale: boolean
    sites: GuideSite[]
    species: Array<{ name: string; count: number }>
  } | null
}

// ─── Building ──────────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function categoryOf(s: SeasonInput): GuideCategory | null {
  const name = s.name.toLowerCase()
  const type = (s.seasonType ?? '').toLowerCase()
  if (type === 'falconry' || /falconry|dove|pigeon|woodcock|snipe|rail|gallinule|crane|migratory game bird/.test(name)) return null
  if (type.startsWith('conservation') || name.includes('conservation order')) return 'Light goose conservation order'
  if (type === 'youth' || type === 'special' || /youth|veteran/.test(name)) return 'Youth and veterans days'
  if (/goose|geese|brant/.test(name)) return 'Geese'
  if (/duck|scaup|teal|merganser|coot|pintail|canvasback/.test(name)) return 'Ducks'
  return null
}

const CATEGORY_ORDER: GuideCategory[] = ['Ducks', 'Geese', 'Youth and veterans days', 'Light goose conservation order']

/** "Regular Duck Season (Split 2) - North Zone" -> name "Regular Duck Season", zone "North Zone" */
function splitName(s: SeasonInput): { name: string; zone: string } {
  const [rawName, ...rest] = s.name.split(' - ')
  const units = Array.isArray(s.units) ? s.units.filter((u): u is string => typeof u === 'string') : []
  const zone = rest.join(' - ').trim() || units.join(', ') || 'Statewide'
  // Splits become date ranges in one row; "Day 1"/"Day 2" likewise
  const name = rawName.replace(/\s*\(Split \d+\)/i, '').replace(/\s+Day \d+$/i, ' Days').trim()
  return { name, zone }
}

function limits(bag: unknown): { daily: number | null; possession: number | null } {
  if (!bag || typeof bag !== 'object') return { daily: null, possession: null }
  const b = bag as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null)
  return { daily: num(b.daily), possession: num(b.possession) }
}

export function buildSections(seasons: SeasonInput[], today: string): Guide['sections'] {
  const rows = new Map<string, GuideRow & { category: GuideCategory }>()
  for (const s of seasons) {
    const category = categoryOf(s)
    if (!category) continue
    const { name, zone } = splitName(s)
    const key = `${category}|${name}|${zone}`
    const start = s.startDate.slice(0, 10)
    const end = s.endDate.slice(0, 10)
    const { daily, possession } = limits(s.bagLimit)
    let row = rows.get(key)
    if (!row) {
      row = { category, name, zone, ranges: [], daily, possession, openToday: false }
      rows.set(key, row)
    }
    // The same season stored twice (a known data duplicate) shows once
    if (!row.ranges.some(r => r.start === start && r.end === end)) row.ranges.push({ start, end })
    // Rows that disagree on the limit keep the larger one (the aggregate, not a sub-limit)
    if (daily !== null && (row.daily === null || daily > row.daily)) row.daily = daily
    if (possession !== null && (row.possession === null || possession > row.possession)) row.possession = possession
    if (start <= today && today <= end) row.openToday = true
  }
  const byFirstDate = (a: GuideRow, b: GuideRow) =>
    a.ranges[0].start.localeCompare(b.ranges[0].start) || a.name.localeCompare(b.name) || a.zone.localeCompare(b.zone)
  return CATEGORY_ORDER
    .map(category => ({
      category,
      rows: [...rows.values()]
        .filter(r => r.category === category)
        .map(({ category: _c, ...r }) => ({ ...r, ranges: [...r.ranges].sort((a, b) => a.start.localeCompare(b.start)) }))
        .sort(byFirstDate),
    }))
    .filter(sec => sec.rows.length > 0)
}

export function buildCounts(dashboard: DashboardInput | null, code: string): Guide['counts'] {
  if (!dashboard) return null
  // The same steps as the Migration page's state cards, so the totals match them
  const all = [...dashboard.currentCounts, ...dashboard.ebirdCounts].filter(c => c.state === code)
  if (all.length === 0) return null
  const groups = groupStates(groupRefuges(sortCounts(enrichCounts(all))), c => c)
  const group = groups[0]
  if (!group) return null
  const shownSites = group.allStale ? group.refuges : group.refuges.filter(r => !r.isStale)
  const species = new Map<string, number>()
  for (const r of shownSites) {
    for (const item of r.items) species.set(item.speciesName, (species.get(item.speciesName) ?? 0) + (item.count || 0))
  }
  return {
    totalBirds: group.totalBirds,
    siteCount: group.refugeCount,
    latestDate: group.latestDate.slice(0, 10),
    allStale: group.allStale,
    sites: shownSites.slice(0, 8).map(r => ({
      name: r.refugeName,
      total: r.totalBirds,
      latestDate: r.latestDate.slice(0, 10),
      ebird: r.items.every(i => i.source === 'ebird'),
    })),
    species: [...species.entries()]
      .map(([name, count]) => ({ name, count }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  }
}

export function buildGuide(
  state: GuideState,
  info: StateInfoInput | null,
  seasons: SeasonInput[],
  dashboard: DashboardInput | null,
  now: Date,
): Guide {
  const asOf = ymd(now)
  const sources = seasons.map(s => s.sourceUrl).filter((u): u is string => !!u)
  return {
    state,
    agencyName: info?.agencyName ?? null,
    agencyUrl: info?.agencyUrl ?? null,
    regulationsUrl: info?.regulationsUrl ?? null,
    seasonYear: guideSeasonYear(now),
    asOf,
    sections: buildSections(seasons, asOf),
    sourceUrl: sources[0] ?? info?.regulationsUrl ?? null,
    counts: buildCounts(dashboard, state.code),
  }
}

// ─── Words ─────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function shortDate(value: string): string {
  const d = parseCalendarDate(value)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function longDate(value: string): string {
  const d = parseCalendarDate(value)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function formatRange(r: { start: string; end: string }): string {
  return r.start === r.end ? shortDate(r.start) : `${shortDate(r.start)} – ${shortDate(r.end)}`
}

export function formatLimit(row: GuideRow): string {
  if (row.daily === null) return '—'
  return row.possession ? `${row.daily} (${row.possession} possession)` : String(row.daily)
}

export function guideTitle(g: Guide): string {
  return `${g.state.name} Duck & Goose Season ${seasonLabel(g.seasonYear)}: Dates, Limits & Bird Counts`
}

/** One or two sentences for the meta description and the page's opening line. */
export function guideSummary(g: Guide): string {
  const parts: string[] = []
  const duck = g.sections.find(s => s.category === 'Ducks')?.rows.filter(r => /regular duck/i.test(r.name)) ?? []
  const openDuck = duck.filter(r => r.openToday)
  if (duck.length > 0) {
    if (openDuck.length === duck.length) {
      const where = duck.length > 1 ? 'in every zone' : /statewide/i.test(duck[0].zone) ? 'statewide' : `in the ${duck[0].zone}`
      parts.push(`Duck season is open ${where} as of ${longDate(g.asOf)}.`)
    } else if (openDuck.length > 0) parts.push(`Duck season is open in ${openDuck.map(r => r.zone).join(', ')} as of ${longDate(g.asOf)}.`)
    else {
      const next = duck.flatMap(r => r.ranges.map(x => x.start)).filter(d => d > g.asOf).sort()[0]
      parts.push(next ? `Duck season opens ${longDate(next)}.` : `Duck season is closed as of ${longDate(g.asOf)}.`)
    }
  }
  if (g.counts && !g.counts.allStale) {
    parts.push(`${g.counts.totalBirds.toLocaleString('en-US')} ducks and geese counted at ${g.counts.siteCount} ${g.counts.siteCount === 1 ? 'site' : 'sites'}, latest ${shortDate(g.counts.latestDate)}.`)
  }
  parts.push(`${g.state.name} waterfowl season dates, zones and bag limits for ${seasonLabel(g.seasonYear)}.`)
  return parts.join(' ')
}

/** The question the "Ask AI" link fills in */
export function guideQuestion(g: GuideState): string {
  return `Where should I duck hunt in ${g.name} this weekend?`
}
