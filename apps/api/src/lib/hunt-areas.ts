// Where to Hunt by area: the places we count, eBird reports and hunter reports, grouped into
// areas about 25 miles across and named after the town a hunter would drive to.
//
// A refuge's count says more about its surroundings than about the refuge: birds roost on a
// sanctuary and feed for miles around, and many survey sites are closed to hunting or private.
// So every signal is evidence about an area, and an area is the answer. Pure functions; the
// route (routes/hunt-areas.ts) gathers the signals.

import { PLACES, type Place } from '../data/places.js'
import { PUBLIC_LANDS, type PublicLand } from '../data/public-lands.js'

/** One piece of evidence at a point */
export interface AreaPoint {
  kind: 'survey' | 'ebird' | 'report'
  id: string
  name: string
  state: string
  lat: number
  lng: number
  /** Birds in the latest count (survey: latest per species; eBird: latest report per species) */
  birds: number
  /** Survey rows with a comparable previous survey: their counts now and then (lib/survey-change.ts) */
  comparableNow: number
  comparablePrevious: number
  /** Latest date behind the birds, YYYY-MM-DD */
  date: string | null
  /** Survey sites: who can hunt there (lib/access.ts) */
  access?: 'public' | 'limited' | 'closed' | 'private' | 'unknown'
  accessNote?: string | null
  url?: string | null
  /** Survey sites: mapped hunting zones */
  zones?: string[] | null
  species: Array<{ slug: string; name: string; count: number }>
}

/** Areas are grouped within this distance of their largest signal: about 25 miles across */
export const AREA_RADIUS_KM = 20

const EARTH_KM = 6371

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** Compass direction from one point to another */
export function directionFrom(lat1: number, lng1: number, lat2: number, lng2: number): (typeof DIRECTIONS)[number] {
  const toRad = Math.PI / 180
  const y = Math.sin((lng2 - lng1) * toRad) * Math.cos(lat2 * toRad)
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lng2 - lng1) * toRad)
  const deg = (Math.atan2(y, x) / toRad + 360) % 360
  return DIRECTIONS[Math.round(deg / 45) % 8]
}

/**
 * Group points into areas: the largest unassigned point starts an area, and every unassigned
 * point within `radiusKm` of it joins. Largest first, so a big refuge anchors its area and
 * small reports around it join it rather than starting their own.
 */
export function clusterPoints(points: AreaPoint[], radiusKm = AREA_RADIUS_KM): AreaPoint[][] {
  const order = [...points].sort((a, b) => b.birds - a.birds || a.id.localeCompare(b.id))
  const taken = new Set<number>()
  const groups: AreaPoint[][] = []
  for (let i = 0; i < order.length; i++) {
    if (taken.has(i)) continue
    const seed = order[i]
    const group = [seed]
    taken.add(i)
    for (let j = i + 1; j < order.length; j++) {
      if (taken.has(j)) continue
      if (distanceKm(seed.lat, seed.lng, order[j].lat, order[j].lng) <= radiusKm) {
        group.push(order[j])
        taken.add(j)
      }
    }
    groups.push(group)
  }
  return groups
}

export interface AreaTown {
  town: string
  state: string
  county: string | null
  /** From the town to the area's center */
  distanceKm: number
  direction: (typeof DIRECTIONS)[number]
}

/**
 * The town that names an area: the one a hunter would recognize, so size counts as well as
 * distance (a town of 8,000 twelve miles off beats a crossroads of 200 two miles off).
 * Same-state towns are preferred. Null when nothing is within 60 km.
 */
export function nameArea(lat: number, lng: number, state: string, places: readonly Place[] = PLACES): AreaTown | null {
  let best: { p: Place; d: number; score: number } | null = null
  for (const p of places) {
    if (Math.abs(p[4] - lat) > 0.6 || Math.abs(p[5] - lng) > 0.75) continue // ~60 km box
    const d = distanceKm(lat, lng, p[4], p[5])
    if (d > 60) continue
    const score = Math.log10(p[3] + 10) - d / 10 - (p[1] === state ? 0 : 1)
    if (!best || score > best.score) best = { p, d, score }
  }
  if (!best) return null
  return {
    town: best.p[0],
    state: best.p[1],
    county: best.p[2] || null,
    distanceKm: Math.round(best.d * 10) / 10,
    direction: directionFrom(best.p[4], best.p[5], lat, lng),
  }
}

export interface AreaSummary {
  state: string
  lat: number
  lng: number
  birds: number
  surveyBirds: number
  surveySites: number
  ebirdBirds: number
  ebirdPlaces: number
  hunterReports: number
  /** Change since the previous surveys over the survey rows that have one */
  change: { now: number; previous: number; percent: number } | null
  latestDate: string | null
  topSpecies: Array<{ slug: string; name: string; count: number }>
}

/** Totals for one area's points; its center is weighted by birds */
export function summarizeArea(points: AreaPoint[]): AreaSummary {
  const birds = points.reduce((s, p) => s + p.birds, 0)
  const w = (p: AreaPoint) => (birds > 0 ? p.birds : 1)
  const wSum = points.reduce((s, p) => s + w(p), 0)
  const lat = points.reduce((s, p) => s + p.lat * w(p), 0) / wSum
  const lng = points.reduce((s, p) => s + p.lng * w(p), 0) / wSum

  const byState = new Map<string, number>()
  for (const p of points) byState.set(p.state, (byState.get(p.state) ?? 0) + w(p))
  const state = [...byState.entries()].sort((a, b) => b[1] - a[1])[0][0]

  const now = points.reduce((s, p) => s + p.comparableNow, 0)
  const previous = points.reduce((s, p) => s + p.comparablePrevious, 0)
  const species = new Map<string, { slug: string; name: string; count: number }>()
  for (const p of points) {
    for (const sp of p.species) {
      const e = species.get(sp.slug)
      if (e) e.count += sp.count
      else species.set(sp.slug, { ...sp })
    }
  }
  const dates = points.map(p => p.date).filter((d): d is string => !!d).sort()
  const of = (k: AreaPoint['kind']) => points.filter(p => p.kind === k)
  return {
    state,
    lat: Math.round(lat * 1e4) / 1e4,
    lng: Math.round(lng * 1e4) / 1e4,
    birds,
    surveyBirds: of('survey').reduce((s, p) => s + p.birds, 0),
    surveySites: of('survey').length,
    ebirdBirds: of('ebird').reduce((s, p) => s + p.birds, 0),
    ebirdPlaces: of('ebird').length,
    hunterReports: of('report').length,
    change: previous > 0 ? { now, previous, percent: Math.round(((now - previous) / previous) * 100) } : null,
    latestDate: dates.length ? dates[dates.length - 1] : null,
    topSpecies: [...species.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  }
}

export type AreaSeason = 'open' | 'closed' | 'unknown'

/**
 * Rank: birds on the ground now, nudged by which way the counts are moving, a cold front
 * pushing birds in, and whether the season is open. Birds lead on purpose: an area's count is
 * the best evidence there is of birds to hunt. A closed season sinks an area but keeps it listed.
 */
export function scoreArea(summary: AreaSummary, pushScore: number, season: AreaSeason, sightingsOnly = false): number {
  const pct = summary.change ? Math.max(-50, Math.min(100, summary.change.percent)) : 0
  const trend = 1 + pct / 200                      // 0.75 .. 1.5
  const push = 1 + 0.1 * Math.max(0, pushScore)    // 1 .. 1.3
  const open = season === 'closed' ? 0.25 : 1
  const huntable = sightingsOnly ? SIGHTINGS_ONLY_FACTOR : 1
  return Math.round(summary.birds * trend * push * open * huntable)
}

/** How far an area of birder sightings alone, with no public land nearby, sinks */
export const SIGHTINGS_ONLY_FACTOR = 0.2

/**
 * An area known only from eBird sightings, with no survey site, no hunter report and no public
 * land within reach: usually city parks and suburban lakes (103 Chicago hotspots ranked #15 of
 * 276 in v1.3.0). Real birds, but not somewhere to hunt; it stays listed, ranked lower.
 */
export function isSightingsOnly(summary: AreaSummary, publicLands: number): boolean {
  return summary.surveySites === 0 && summary.hunterReports === 0 && publicLands === 0
}

/**
 * Rank areas (already sorted best first) overall and within their state. With perState, keep the
 * best few of each state, still best first, for the map: across nine states the overall top 15
 * were all on the Illinois and Mississippi river surveys, with nothing near a Texas hunter.
 */
export function rankAreas<T extends { state: string }>(sorted: T[], max: number, perState?: number): Array<T & { rank: number; stateRank: number }> {
  const seen = new Map<string, number>()
  const ranked = sorted.map((a, i) => {
    const stateRank = (seen.get(a.state) ?? 0) + 1
    seen.set(a.state, stateRank)
    return { ...a, rank: i + 1, stateRank }
  })
  return perState ? ranked.filter(a => a.stateRank <= perState) : ranked.slice(0, max)
}

/** Public land listed for an area reaches this far past the area's own edge */
export const PUBLIC_LAND_REACH_KM = 15

export interface NearbyLand {
  name: string
  kind: string
  /** Null when PAD-US doesn't name the managing agency */
  manager: string | null
  access: 'OA' | 'RA'
  acres: number
  lat: number
  lng: number
  /** From the area's center */
  distanceKm: number
  direction: (typeof DIRECTIONS)[number]
}

/**
 * Public land in and around an area (data/public-lands.ts, from PAD-US), best first. Size counts
 * as well as distance, so a 30,000-acre WMA ten miles off comes before a 40-acre natural area
 * next door. PAD-US records public access, not hunting rules.
 */
export function publicLandsNear(
  lat: number, lng: number, radiusKm: number, max = 6, lands: readonly PublicLand[] = PUBLIC_LANDS,
): NearbyLand[] {
  const reach = radiusKm + PUBLIC_LAND_REACH_KM
  const latPad = reach / 111
  const lngPad = reach / (111 * Math.cos(lat * Math.PI / 180))
  const found: Array<{ land: NearbyLand; rank: number }> = []
  for (const l of lands) {
    if (Math.abs(l[6] - lat) > latPad || Math.abs(l[7] - lng) > lngPad) continue
    const d = distanceKm(lat, lng, l[6], l[7])
    if (d > reach) continue
    found.push({
      rank: d - 6 * Math.log10(Math.max(l[5], 1)),
      land: {
        name: l[0], kind: l[1], manager: l[2] === 'Unknown' ? null : l[2], access: l[4], acres: l[5],
        lat: l[6], lng: l[7], distanceKm: Math.round(d * 10) / 10, direction: directionFrom(lat, lng, l[6], l[7]),
      },
    })
  }
  return found.sort((a, b) => a.rank - b.rank).slice(0, max).map(f => f.land)
}

/** A location HuntStack has checked itself (locations.metadata.access) */
export interface CheckedPlace {
  name: string
  lat: number
  lng: number
  access: 'public' | 'limited' | 'closed' | 'private' | 'unknown'
  note: string | null
}

/** [name, kind, manager | null, state, access, acres, lat, lng, HuntStack's note | null] */
export type MapLand = [string, string, string | null, string, 'OA' | 'RA', number, number, number, string | null]

/**
 * Every PAD-US unit for the map, with HuntStack's own access checks applied the way Where to Hunt
 * applies them: a unit we found closed to waterfowl hunting or private (Clarence Cannon NWR) is
 * left out, and our note rides along. A check matches a unit by name within 30 km.
 */
export function mapLands(checked: readonly CheckedPlace[], lands: readonly PublicLand[] = PUBLIC_LANDS): MapLand[] {
  const out: MapLand[] = []
  for (const l of lands) {
    const mine = checked.find(c => sameUnit(l[0], c.name) && distanceKm(l[6], l[7], c.lat, c.lng) <= 30)
    if (mine && (mine.access === 'closed' || mine.access === 'private')) continue
    out.push([l[0], l[1], l[2] === 'Unknown' ? null : l[2], l[3], l[4], l[5], l[6], l[7], mine?.note ?? null])
  }
  return out
}

/** Loose name match for listing a survey site and a public land unit once ("Loess Bluffs NWR") */
export function sameUnit(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10)
  return norm(a).length >= 6 && norm(a) === norm(b)
}
