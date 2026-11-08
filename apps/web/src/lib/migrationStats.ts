// The numbers the Migration page and the shareable /report page both show. They used to keep
// their own copies of this math and disagreed on the same day (559,743 birds vs 4.7 million,
// index 75 vs 77), because one counted years-old surveys and used a different index formula.
// One definition, used by both.

import { parseCalendarDate } from './dates'

export type MigrationStatus =
  | 'arriving'
  | 'building'
  | 'peak'
  | 'declining'
  | 'departing'
  | 'first_survey'
  | null

export type AnomalyType = 'spike' | 'drop' | null

export function getMigrationStatus(
  trend: 'increasing' | 'decreasing' | 'stable' | 'new',
  deltaPercent: number | null,
): MigrationStatus {
  if (trend === 'new') return 'first_survey'
  if (trend === 'increasing') {
    return (deltaPercent !== null && deltaPercent > 20) ? 'arriving' : 'building'
  }
  if (trend === 'stable') return 'peak'
  if (trend === 'decreasing') {
    return (deltaPercent !== null && deltaPercent < -20) ? 'departing' : 'declining'
  }
  return null
}

export function getAnomaly(count: number, deltaPercent: number | null, previousCount: number | null): AnomalyType {
  if (deltaPercent === null || previousCount === null) return null
  if (deltaPercent >= 30 && count >= 500) return 'spike'
  if (deltaPercent <= -40 && previousCount >= 500) return 'drop'
  return null
}

// Counts older than this are not actionable. Off-season (March-August) the previous season's
// counts after Feb 1 still read as the latest picture; from September on, the season is live
// and weekly surveys older than four weeks no longer say what the birds are doing.
export function staleThresholdFor(now: Date): Date {
  const month = now.getMonth() // 0-indexed
  if (month >= 2 && month <= 7) return new Date(now.getFullYear(), 1, 1)
  return new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)
}

/** The window the headline numbers cover, in words, e.g. "last 4 weeks" */
export function freshWindowLabel(now: Date): string {
  const month = now.getMonth()
  return month >= 2 && month <= 7 ? `since Feb 1` : 'last 4 weeks'
}

type CountLike = { refugeId: string; count: number; surveyDate: string; source?: string }

/**
 * Headline totals: agency survey counts from the fresh window only. eBird rows are birder
 * reports, not counts of birds, and stale surveys say nothing about this week.
 */
export function headlineStats<T extends CountLike>(counts: T[], now = new Date()) {
  const threshold = staleThresholdFor(now)
  const fresh = counts.filter(c => c.source !== 'ebird' && parseCalendarDate(c.surveyDate) >= threshold)
  return {
    fresh,
    totalBirds: fresh.reduce((s, c) => s + (c.count || 0), 0),
    siteCount: new Set(fresh.map(c => c.refugeId)).size,
  }
}

// ─── Migration Index ──────────────────────────────────────────────────────────
// Composite 0–100 score: trend (25) + volume (20) + weather (15) + eBird community (25) + anomaly (15)

export type MigrationIndexResult = {
  score: number
  label: 'Quiet' | 'Active' | 'Strong' | 'Peak Movement'
  labelColor: string
  components: {
    trend: number     // 0-25
    volume: number    // 0-20
    weather: number   // 0-15
    ebird: number     // 0-25
    anomaly: number   // 0-15
  }
}

export function computeMigrationIndex(
  counts: Array<{ trend: string; anomaly: AnomalyType; deltaPercent: number | null }>,
  overallPushScore: number,
  stateActivity?: Array<{ activityLevel: 'high' | 'moderate' | 'low' }>,
): MigrationIndexResult {
  const empty: MigrationIndexResult = {
    score: 0, label: 'Quiet', labelColor: 'text-earth-500 dark:text-earth-400',
    components: { trend: 0, volume: 0, weather: 0, ebird: 0, anomaly: 0 },
  }
  if (counts.length === 0) return empty

  const withData = counts.filter(c => c.trend !== 'new')

  // Trend component: % of refuges increasing (0–25)
  const increasing = withData.filter(c => c.trend === 'increasing').length
  const trend = withData.length > 0 ? Math.round((increasing / withData.length) * 25) : 0

  // Volume delta component: average positive deltaPercent (0–20)
  const posDeltas = withData.filter(c => c.deltaPercent !== null && c.deltaPercent > 0)
  const avgDelta = posDeltas.length > 0
    ? posDeltas.reduce((s, c) => s + (c.deltaPercent ?? 0), 0) / posDeltas.length
    : 0
  const volume = Math.min(20, Math.round((avgDelta / 60) * 20))

  // Weather push component: pushScore 0–3 → 0–15
  const weather = Math.round((overallPushScore / 3) * 15)

  // eBird community activity: high=2pts, moderate=1pt per state, max 25
  const totalStates = stateActivity?.length ?? 0
  let ebird = 0
  if (totalStates > 0) {
    const highCount = stateActivity!.filter(s => s.activityLevel === 'high').length
    const modCount = stateActivity!.filter(s => s.activityLevel === 'moderate').length
    ebird = Math.min(25, Math.round(((highCount * 2 + modCount * 1) / (totalStates * 2)) * 25))
  }

  // Anomaly bonus: spikes add, drops subtract — no artificial baseline (0–15)
  const spikes = counts.filter(c => c.anomaly === 'spike').length
  const drops = counts.filter(c => c.anomaly === 'drop').length
  const anomaly = Math.max(0, Math.min(15, spikes * 5 - drops * 3))

  const total = Math.min(100, trend + volume + weather + ebird + anomaly)

  let label: MigrationIndexResult['label']
  let labelColor: string
  if (total >= 76) { label = 'Peak Movement'; labelColor = 'text-red-600 dark:text-red-400' }
  else if (total >= 51) { label = 'Strong'; labelColor = 'text-orange-600 dark:text-orange-400' }
  else if (total >= 26) { label = 'Active'; labelColor = 'text-amber-600 dark:text-amber-400' }
  else { label = 'Quiet'; labelColor = 'text-earth-500 dark:text-earth-400' }

  return { score: total, label, labelColor, components: { trend, volume, weather, ebird, anomaly } }
}

/** A count change in plain words: "+12.5%" below doubling, "10×" from there ("+9400%" read as noise). */
export function formatChange(deltaPercent: number, digits = 1): string {
  if (deltaPercent >= 100) return `${Math.round(1 + deltaPercent / 100)}×`
  return `${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(digits)}%`
}

/** "mississippi" -> "Mississippi" */
export function flywayLabel(flyway: string): string {
  return flyway.charAt(0).toUpperCase() + flyway.slice(1)
}
