// Survey-to-survey change for one species at one place: delta, percent and trend.
//
// Two counts are compared only when the surveys are close enough together to describe a
// movement of birds. Weekly and biweekly surveys always are. LDWF's statewide aerial survey is
// monthly, and its "previous" survey is often September's teal-only flight or last January's:
// Nov 2026's blue-winged teal (259,000 against September's 73,000) read as a +255% "spike",
// and the Migration page told hunters to "Get to Louisiana now" while the state was 45% below
// last November. Further apart than this, a count is the first of a new run: no change, no trend.

import { FRESH_DAYS } from './freshness.js'

/** The longest gap between two surveys whose counts can be compared (one missed biweekly survey) */
export const COMPARABLE_DAYS = FRESH_DAYS

export type SurveyTrend = 'increasing' | 'decreasing' | 'stable' | 'new'

export interface SurveyChange {
  previousCount: number | null
  previousDate: string | null
  delta: number | null
  deltaPercent: number | null
  trend: SurveyTrend
}

function dayOf(d: string | Date | null | undefined): number | null {
  if (d === null || d === undefined) return null
  const t = d instanceof Date ? d.getTime() : Date.parse(String(d).slice(0, 10))
  return Number.isNaN(t) ? null : Math.round(t / 86_400_000)
}

function isoDay(d: string | Date): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
}

/**
 * Compare a count with the previous survey of the same species at the same place.
 * A previous survey more than COMPARABLE_DAYS earlier (or with no date) isn't compared:
 * the result is trend 'new' with no previous count.
 */
export function surveyChange(
  count: number,
  surveyDate: string | Date | null | undefined,
  previousCount: number | null | undefined,
  previousDate: string | Date | null | undefined,
): SurveyChange {
  const none: SurveyChange = { previousCount: null, previousDate: null, delta: null, deltaPercent: null, trend: 'new' }
  if (previousCount === null || previousCount === undefined) return none
  const day = dayOf(surveyDate)
  const prevDay = dayOf(previousDate)
  if (day === null || prevDay === null || day - prevDay > COMPARABLE_DAYS) return none

  const delta = count - previousCount
  const deltaPercent = previousCount !== 0
    ? Math.round((delta / previousCount) * 1000) / 10
    : null
  let trend: SurveyTrend
  if (deltaPercent !== null && Math.abs(deltaPercent) < 5) trend = 'stable'
  else if (delta > 0) trend = 'increasing'
  else trend = 'decreasing'
  return { previousCount, previousDate: isoDay(previousDate as string | Date), delta, deltaPercent, trend }
}
