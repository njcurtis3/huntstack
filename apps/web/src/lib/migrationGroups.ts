// How the Migration page turns the dashboard's counts into sites and states with a migration
// status, spikes and drops, and arrows between states. The Map page draws the same things, so
// both read them from here: two copies of this math would drift apart (see migrationStats.ts).

import { SITE_COUNTS_ONLY, STATEWIDE_SURVEY, STATE_CENTERS } from './states'
import { parseCalendarDate } from './dates'
import { getAnomaly, getMigrationStatus, staleThresholdFor, type AnomalyType, type MigrationStatus } from './migrationStats'

type Trend = 'increasing' | 'decreasing' | 'stable' | 'new'

type CountLike = {
  refugeId: string
  refugeName: string
  state: string
  flyway: string | null
  species: string
  count: number
  surveyDate: string
  trend: Trend
  deltaPercent: number | null
  previousCount: number | null
  source?: string
}

// Approximate state centers [lng, lat]: flow arrows and state markers, and the map marker of a
// statewide survey with no point of its own
export const STATE_CENTROIDS: Readonly<Record<string, [number, number]>> = STATE_CENTERS

// States in each flyway, north to south
export const FLYWAY_STATE_ORDER: Record<string, string[]> = {
  central:     ['MT', 'ND', 'SD', 'NE', 'KS', 'CO', 'OK', 'TX', 'NM'],
  mississippi: ['MN', 'WI', 'IA', 'IL', 'MO', 'TN', 'AR', 'MS', 'LA'],
  pacific:     ['WA', 'OR', 'ID', 'NV', 'CA'],
  atlantic:    ['ME', 'NY', 'PA', 'NJ', 'MD', 'VA', 'NC', 'SC', 'GA', 'FL'],
  '':          ['ND', 'SD', 'MN', 'NE', 'IA', 'IL', 'KS', 'MO', 'CO', 'OK', 'AR', 'TX', 'LA', 'NM', 'MS'],
}

// Map colors per migration status (the state colors and the legend)
export const STATUS_HEX: Record<string, string> = {
  arriving: '#1f883d',
  building: '#0969da',
  peak: '#bf8700',
  declining: '#f97316',
  departing: '#ef4444',
  first_survey: '#01210a',
  none: '#57606a',
}

export const STATUS_LABELS: Record<NonNullable<MigrationStatus>, string> = {
  arriving: 'Arriving',
  building: 'Building',
  peak: 'Peak',
  declining: 'Declining',
  departing: 'Departing',
  first_survey: 'New Data',
}

export const PUSH_SCORE_LABELS = ['Low', 'Moderate', 'High', 'Extreme']

// Headline pressure = the strongest state or region, as a whole step 0–3 for the
// label/dot lookups (scores move in 0.5 steps; an incoming front counts half).
export function overallPushScoreOf(factors: { pushScore: number }[]): number {
  const max = factors.reduce((m, f) => Math.max(m, f.pushScore), 0)
  return Math.min(3, Math.floor(max))
}

export type FlowDirection = 'south' | 'north' | 'both' | null

export function computeFlowDirection(
  upperStatus: MigrationStatus,
  lowerStatus: MigrationStatus,
  upperBirds?: number,
  lowerBirds?: number,
): FlowDirection {
  // Trend-based (multi-survey data): first_survey treated as arriving
  const upper = upperStatus === 'first_survey' ? 'arriving' : upperStatus
  const lower = lowerStatus === 'first_survey' ? 'arriving' : lowerStatus
  const isSouthUpper = upper === 'declining' || upper === 'departing'
  const isSouthLower = lower === 'arriving' || lower === 'building'
  const isNorthUpper = upper === 'arriving' || upper === 'building'
  const isNorthLower = lower === 'declining' || lower === 'departing'
  if (isSouthUpper && isSouthLower) return 'south'
  if (isNorthUpper && isNorthLower) return 'north'
  if (isNorthUpper && isSouthLower) return 'both'

  // Magnitude-based fallback when both states only have first-survey data:
  // more birds in upper state → northward staging; more in lower → southward/wintering
  if (
    (upperStatus === 'first_survey' || upperStatus === null) &&
    (lowerStatus === 'first_survey' || lowerStatus === null) &&
    upperBirds !== undefined && lowerBirds !== undefined
  ) {
    const ratio = upperBirds > 0 && lowerBirds > 0
      ? Math.max(upperBirds, lowerBirds) / Math.min(upperBirds, lowerBirds)
      : 0
    if (ratio >= 2) {
      // Significant concentration difference — show direction of concentration
      return upperBirds > lowerBirds ? 'north' : 'south'
    }
  }

  return null
}

/** Each count with its migration status and spike/drop. eBird rows are the latest report near a
 *  place, with nothing to compare against, so they get neither. */
export function enrichCounts<T extends CountLike>(counts: T[]) {
  return counts.map(item => ({
    ...item,
    migrationStatus: (item.source === 'ebird' ? null : getMigrationStatus(item.trend, item.deltaPercent)) as MigrationStatus,
    anomaly: (item.source === 'ebird' ? null : getAnomaly(item.count, item.deltaPercent, item.previousCount)) as AnomalyType,
  }))
}

type Enriched = CountLike & { migrationStatus: MigrationStatus; anomaly: AnomalyType }

/** Spikes and drops first, then the largest counts. */
export function sortCounts<T extends Enriched>(counts: T[]): T[] {
  return [...counts].sort((a, b) => {
    const aIsAnomaly = a.anomaly !== null ? 1 : 0
    const bIsAnomaly = b.anomaly !== null ? 1 : 0
    if (bIsAnomaly !== aIsAnomaly) return bIsAnomaly - aIsAnomaly
    return b.count - a.count
  })
}

/** Counted birds now against the same species' previous counts at the same places, over the
 *  rows that have one. The API leaves out a previous survey too far back to compare (a monthly
 *  survey, or last season), so this is survey-to-survey movement. */
export type Change = { now: number; previous: number; percent: number }

function changeOf<T extends CountLike>(items: T[]): { now: number; previous: number } {
  let now = 0
  let previous = 0
  for (const c of items) {
    if (c.source === 'ebird' || c.previousCount === null || c.previousCount === undefined) continue
    now += c.count || 0
    previous += c.previousCount
  }
  return { now, previous }
}

function asChange(t: { now: number; previous: number }): Change | null {
  return t.previous > 0 ? { ...t, percent: Math.round(((t.now - t.previous) / t.previous) * 100) } : null
}

/** A site's or state's spike or drop: its overall change, by the same thresholds as one species.
 *  One species at one site rising 30% used to flag the whole site and state, and a spike in any
 *  one row hid drops in all the others. */
function anomalyOf(change: Change | null): AnomalyType {
  return change ? getAnomaly(change.now, change.percent, change.previous) : null
}

export type RefugeGroup<T> = {
  refugeId: string
  refugeName: string
  state: string
  flyway: string | null
  totalBirds: number
  speciesCount: number
  latestDate: string
  topAnomaly: AnomalyType
  /** Change since the previous surveys (null when stale or nothing to compare) */
  change: Change | null
  dominantStatus: MigrationStatus
  isStale: boolean
  items: T[]
}

const STATUS_PRIORITY: MigrationStatus[] = ['arriving', 'first_survey', 'building', 'peak', 'declining', 'departing', null]

/** One group per site, from counts already sorted by sortCounts. */
export function groupRefuges<T extends Enriched>(sortedCounts: T[]): RefugeGroup<T>[] {
  const staleThresholdMs = staleThresholdFor(new Date()).getTime()
  const map = new Map<string, T[]>()
  for (const item of sortedCounts) {
    const arr = map.get(item.refugeId) ?? []
    arr.push(item)
    map.set(item.refugeId, arr)
  }
  return Array.from(map.entries()).map(([refugeId, allItems]) => {
    // eBird rows share a refuge's id, so one recent sighting used to make a whole group look
    // current and drag years-old official counts into its totals. Judge freshness per row:
    // a refuge with any fresh rows shows only those; one with none keeps its old rows, marked stale.
    const freshItems = allItems.filter(c => parseCalendarDate(c.surveyDate).getTime() >= staleThresholdMs)
    const isStale = freshItems.length === 0
    const items = isStale ? allItems : freshItems
    const first = items[0]
    const totalBirds = items.reduce((s, c) => s + (c.count || 0), 0)
    const latestDate = items.reduce((best, c) =>
      c.surveyDate > best ? c.surveyDate : best, items[0].surveyDate)
    const change = isStale ? null : asChange(changeOf(items))
    const topAnomaly = anomalyOf(change)
    // Dominant status: pick the status that appears most, preferring interesting ones
    const dominantStatus = STATUS_PRIORITY.find(s => items.some(c => c.migrationStatus === s)) ?? null
    return {
      refugeId,
      refugeName: first.refugeName,
      state: first.state,
      flyway: first.flyway,
      totalBirds,
      speciesCount: items.length,
      latestDate,
      topAnomaly,
      change,
      dominantStatus,
      isStale,
      items,
    }
  })
}

export type StateGroup<T> = {
  state: string
  stateName: string
  totalBirds: number
  freshTotalBirds: number
  refugeCount: number
  speciesCount: number
  latestDate: string
  topAnomaly: AnomalyType
  /** Change since the previous surveys over the state's current sites */
  change: Change | null
  dominantStatus: MigrationStatus
  allStale: boolean
  refuges: RefugeGroup<T>[]
}

/**
 * The statewide agency survey each state's count waits on. Until it is in, a state's card is a
 * few refuges and eBird places (Texas: about 1,000 birds), which reads as "no ducks in Texas".
 * `site` names the survey's own row on the card (AGFC, LDWF fly in season); a state without one
 * only gets the January midwinter survey, whose numbers never land on this card (USFWS's
 * "Statewide MWI" rows and TPWD's survey are annual and feed the Historical MWI chart).
 */
// STATEWIDE_SURVEY and SITE_COUNTS_ONLY come from the state registry (@huntstack/shared/states)

/**
 * The note a current state card needs because its total is not the whole state: waiting on the
 * statewide survey, or site counts only. Null when the card has its statewide survey.
 */
export function partialCountNote(sg: StateGroup<unknown>): string | null {
  if (sg.allStale) return null
  const sites = sg.refugeCount === 1 ? 'one site' : `${sg.refugeCount} sites`
  if (SITE_COUNTS_ONLY.has(sg.state)) return `Site counts only, not a statewide survey. This total is ${sites}.`
  const s = STATEWIDE_SURVEY[sg.state]
  if (!s) return null
  if (s.site && sg.refuges.some(r => r.refugeName === s.site && !r.isStale)) return null
  return `Waiting for ${s.survey} counts. This total is ${sites}, not the whole state.`
}

/**
 * One group per state: current states before stale ones, then by how much the counts moved
 * (most rising first, see weightedChange), then states with nothing to compare (eBird places, first surveys) by birds.
 * Not by birds alone: states aren't counted alike (LDWF's statewide estimate against Texas's few
 * refuges), so the biggest total was mostly the state with the most survey coverage.
 */
export function groupStates<T extends Enriched>(refugeGroups: RefugeGroup<T>[], nameOf: (code: string) => string): StateGroup<T>[] {
  const map = new Map<string, RefugeGroup<T>[]>()
  for (const rg of refugeGroups) {
    const arr = map.get(rg.state) ?? []
    arr.push(rg)
    map.set(rg.state, arr)
  }
  return Array.from(map.entries()).map(([state, groups]) => {
    // Fresh refuges first, largest first, so "Top refuge" in This Weekend is the busiest current one
    const refuges = [
      ...groups.filter(r => !r.isStale).sort((a, b) => b.totalBirds - a.totalBirds),
      ...groups.filter(r => r.isStale),
    ]
    const freshRefuges = refuges.filter(r => !r.isStale)
    const freshTotalBirds = freshRefuges.reduce((s, r) => s + r.totalBirds, 0)
    const allStale = freshRefuges.length === 0
    // The card's headline numbers and "Updated" date describe current data only; an all-stale
    // state keeps its old numbers under the "Previous season data" banner.
    const shown = allStale ? refuges : freshRefuges
    const totalBirds = shown.reduce((s, r) => s + r.totalBirds, 0)
    const speciesCount = new Set(shown.flatMap(r => r.items.map(i => i.species))).size
    const latestDate = shown.reduce((best, r) => r.latestDate > best ? r.latestDate : best, shown[0].latestDate)
    const change = asChange(changeOf(freshRefuges.flatMap(r => r.items)))
    const topAnomaly = anomalyOf(change)
    const dominantStatus = STATUS_PRIORITY.find(s => freshRefuges.some(r => r.dominantStatus === s)) ?? null
    return {
      state,
      stateName: nameOf(state),
      totalBirds,
      freshTotalBirds,
      refugeCount: shown.length,
      speciesCount,
      latestDate,
      topAnomaly,
      change,
      dominantStatus,
      allStale,
      refuges,
    }
  }).sort((a, b) =>
    Number(a.allStale) - Number(b.allStale)
    || Number(!a.change) - Number(!b.change)
    || weightedChange(b) - weightedChange(a)
    || b.freshTotalBirds - a.freshTotalBirds)
}

/**
 * A state's change for ordering: capped at -50..+100%, and worth less when measured at one or
 * two sites (full weight from three sites with a previous survey), so one small site up 4x
 * doesn't put its state first.
 */
export function weightedChange(sg: StateGroup<unknown>): number {
  if (!sg.change) return 0
  const compared = sg.refuges.filter(r => !r.isStale && r.change).length
  return Math.max(-50, Math.min(100, sg.change.percent)) * Math.min(1, compared / 3)
}

export type FlowLeg = { from: string; to: string; flow: Exclude<FlowDirection, null> }

/**
 * Arrows between neighboring states down each flyway (north to south), the way the Migration
 * page's Flyway Flow pairs them, but skipping states with no data so a gap (Tennessee, between
 * Missouri and Arkansas) doesn't break the chain on a map.
 */
export function flowLegs(stateGroups: Array<{ state: string; dominantStatus: MigrationStatus; totalBirds: number }>): FlowLeg[] {
  const byState = new Map(stateGroups.map(s => [s.state, s]))
  const legs: FlowLeg[] = []
  for (const fw of ['central', 'mississippi', 'pacific', 'atlantic']) {
    const chain = FLYWAY_STATE_ORDER[fw].filter(code => byState.has(code))
    for (let i = 0; i < chain.length - 1; i++) {
      const a = byState.get(chain[i])!
      const b = byState.get(chain[i + 1])!
      const flow = computeFlowDirection(a.dominantStatus, b.dominantStatus, a.totalBirds, b.totalBirds)
      if (flow) legs.push({ from: a.state, to: b.state, flow })
    }
  }
  return legs
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']

function roughBirds(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} million` : `${Math.round(n / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * A current monthly statewide survey against its own long-term average for that month:
 * "51% below the November average of 1.4 million (19 surveys, 2004–2025)". Null for a stale
 * site, or when the average belongs to a different survey than the one the card shows.
 */
export function longTermNote(
  group: { refugeId: string; latestDate: string; isStale: boolean },
  averages: Array<{ locationId: string; surveyDate: string; total: number; avgTotal: number; surveysInAverage: number; firstYear: number; lastYear: number }>,
): string | null {
  if (group.isStale) return null
  const a = averages.find(x => x.locationId === group.refugeId)
  if (!a || a.avgTotal <= 0 || a.surveyDate !== group.latestDate.slice(0, 10)) return null
  const month = MONTH_NAMES[Number(a.surveyDate.slice(5, 7)) - 1]
  const pct = Math.round(((a.total - a.avgTotal) / a.avgTotal) * 100)
  const vs = Math.abs(pct) < 10 ? 'About' : `${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'}`
  return `${vs} the ${month} average of ${roughBirds(a.avgTotal)} (${a.surveysInAverage} surveys, ${a.firstYear}–${a.lastYear})`
}
