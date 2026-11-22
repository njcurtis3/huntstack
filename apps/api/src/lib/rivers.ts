// River flow against normal, for the Map's river layer (GET /api/hunt/rivers). Pure functions; the
// route fetches the latest flows from USGS and hands them here.
//
// "Normal" is USGS's own record for the gauge: the percentiles of mean daily flow for this time of
// year (scripts/build-river-gauges.py keeps one set per half-month). The classes are USGS
// WaterWatch's: below the 10th percentile is much below normal, 10th-24th below, 25th-75th
// normal, 76th-90th above, over the 90th much above. High water in the bottoms (flooded timber,
// sheet water in fields) shows up as above or much above; a dry fall as below.

export type FlowClass = 'much-below' | 'below' | 'normal' | 'above' | 'much-above'
export type FlowTrend = 'rising' | 'falling' | 'steady'

/** Index of the half-month holding a date: 0 = Jan 1-15 ... 23 = Dec 16-31 (UTC calendar day) */
export function halfMonthOf(d: Date): number {
  return d.getUTCMonth() * 2 + (d.getUTCDate() <= 15 ? 0 : 1)
}

export interface Percentiles { p10: number; p25: number; p50: number; p75: number; p90: number | null }

/**
 * Roughly where a flow sits in the gauge's record for this time of year, 0-100: straight lines
 * between the published percentiles. Below p10 it is "under 10" and above the top published
 * percentile "over" it, so those ends come back as 5 and the top + 5, never a made-up exact rank.
 */
export function flowPercentile(cfs: number, p: Percentiles): number {
  const pts: Array<[number, number]> = [[10, p.p10], [25, p.p25], [50, p.p50], [75, p.p75]]
  if (p.p90 !== null) pts.push([90, p.p90])
  if (cfs < pts[0][1]) return 5
  for (let i = 1; i < pts.length; i++) {
    const [r0, v0] = pts[i - 1]
    const [r1, v1] = pts[i]
    if (cfs <= v1) return v1 === v0 ? r1 : Math.round(r0 + ((cfs - v0) / (v1 - v0)) * (r1 - r0))
  }
  return pts[pts.length - 1][0] + 5
}

export function flowClass(cfs: number, p: Percentiles): FlowClass {
  if (cfs < p.p10) return 'much-below'
  if (cfs < p.p25) return 'below'
  if (cfs <= p.p75) return 'normal'
  if (p.p90 !== null && cfs > p.p90) return 'much-above'
  return 'above'
}

/** Rising or falling: the change from the mean daily flow about a week ago, past 15% either way */
export function flowTrend(now: number, weekAgo: number | null): { trend: FlowTrend; changePercent: number | null } {
  if (weekAgo === null || !(weekAgo > 0)) return { trend: 'steady', changePercent: null }
  const changePercent = Math.round(((now - weekAgo) / weekAgo) * 100)
  return { trend: changePercent > 15 ? 'rising' : changePercent < -15 ? 'falling' : 'steady', changePercent }
}

/** The mean daily flow closest to `days` before `today` (YYYY-MM-DD keys), within 2 days of it */
export function flowDaysAgo(daily: Map<string, number>, today: Date, days: number): number | null {
  for (const off of [0, 1, -1, 2, -2]) {
    const d = new Date(today.getTime() - (days + off) * 86_400_000).toISOString().slice(0, 10)
    const v = daily.get(d)
    if (v !== undefined) return v
  }
  return null
}
