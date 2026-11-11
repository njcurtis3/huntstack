// How the Migration page turns the dashboard's counts into sites and states with a migration
// status, spikes and drops, and arrows between states. The Map page draws the same things, so
// both read them from here: two copies of this math would drift apart (see migrationStats.ts).

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
export const STATE_CENTROIDS: Record<string, [number, number]> = {
  MT: [-110.4, 47.0], ND: [-100.5, 47.5], SD: [-100.2, 44.5],
  NE: [-99.9, 41.5], KS: [-98.4, 38.5], CO: [-105.5, 39.0],
  OK: [-97.5, 35.5], TX: [-99.3, 31.0], NM: [-106.1, 34.4],
  MN: [-94.6, 46.4], WI: [-89.6, 44.5], IA: [-93.1, 42.0],
  IL: [-89.2, 40.0], MO: [-92.5, 38.3], TN: [-86.4, 35.9],
  AR: [-92.4, 34.8], MS: [-89.7, 32.7], LA: [-91.8, 31.0],
  WA: [-120.5, 47.4], OR: [-120.5, 44.0], ID: [-114.5, 44.5],
  NV: [-116.7, 39.5], CA: [-119.4, 37.2],
}

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

export type RefugeGroup<T> = {
  refugeId: string
  refugeName: string
  state: string
  flyway: string | null
  totalBirds: number
  speciesCount: number
  latestDate: string
  topAnomaly: AnomalyType
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
    const topAnomaly: AnomalyType = !isStale && items.some(c => c.anomaly === 'spike') ? 'spike'
      : !isStale && items.some(c => c.anomaly === 'drop') ? 'drop' : null
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
  dominantStatus: MigrationStatus
  allStale: boolean
  refuges: RefugeGroup<T>[]
}

/** One group per state, busiest current state first. */
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
    const topAnomaly: AnomalyType = freshRefuges.some(r => r.topAnomaly === 'spike') ? 'spike'
      : freshRefuges.some(r => r.topAnomaly === 'drop') ? 'drop' : null
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
      dominantStatus,
      allStale,
      refuges,
    }
  }).sort((a, b) => b.freshTotalBirds - a.freshTotalBirds)
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
