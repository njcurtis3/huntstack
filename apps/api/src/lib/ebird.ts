// ─── eBird API v2 integration ─────────────────────────────────────────────────
// Provides recent community waterfowl observations near known refuges (geo), and per-species
// reports by place for whole states (chat answers, statewide activity in ebird-activity.ts).
//
// eBird's /data/obs/{region}/recent, /historic and /geo/recent return ONE observation per
// species: the latest in the whole region or radius (Texas, 30 days: 488 rows, one of them a
// snow goose). Only the per-species endpoints (/recent/{species}) return every place, and
// then only each place's latest report. Nothing here can total all reports over a window.
// Data is live-fetched (no DB writes) with in-memory caches.
// Gracefully returns [] on any error — dashboard works without eBird data.
//
// API docs: https://documenter.getpostman.com/view/664302/S1ENwy59
// Auth: X-eBirdApiToken header (set EBIRD_API_KEY in .env)

import { BoundedCache } from './cache.js'

const EBIRD_BASE = 'https://api.ebird.org/v2'
const GEO_TTL      = 6 * 60 * 60 * 1000  // 6 hours  — per-refuge geo queries
const SPECIES_TTL  = 7 * 60 * 60 * 1000  // 7 hours  — per-species state queries; refreshed every 6h (ebird-activity.ts), so a page never waits on an expired entry

// ─── Cache ────────────────────────────────────────────────────────────────────

const obsCache      = new BoundedCache<EBirdCount[]>()

// ─── eBird species code → HuntStack slug ─────────────────────────────────────
// eBird uses 6-letter alpha codes. Maps to our species slugs + display names.

const EBIRD_SPECIES: Record<string, { slug: string; name: string }> = {
  mallar3: { slug: 'mallard',              name: 'Mallard' },
  norpin:  { slug: 'pintail',              name: 'Northern Pintail' },
  snogoo:  { slug: 'snow-goose',           name: 'Snow Goose' },
  cangoo:  { slug: 'canada-goose',         name: 'Canada Goose' },
  gwfgoo:  { slug: 'white-fronted-goose',  name: 'Greater White-fronted Goose' },
  rosgoo:  { slug: 'ross-goose',           name: "Ross's Goose" },
  gadwal:  { slug: 'gadwall',              name: 'Gadwall' },
  norsho:  { slug: 'northern-shoveler',    name: 'Northern Shoveler' },
  amewig:  { slug: 'american-wigeon',      name: 'American Wigeon' },
  gnwtea:  { slug: 'green-winged-teal',    name: 'Green-winged Teal' },
  buwtea:  { slug: 'blue-winged-teal',     name: 'Blue-winged Teal' },
  canvas:  { slug: 'canvasback',           name: 'Canvasback' },
  redhea:  { slug: 'redhead',              name: 'Redhead' },
  lessca:  { slug: 'scaup',               name: 'Scaup' },
  gresca:  { slug: 'scaup',               name: 'Scaup' },
  buffle:  { slug: 'bufflehead',           name: 'Bufflehead' },
  rudduc:  { slug: 'ruddy-duck',           name: 'Ruddy Duck' },
  rinduc:  { slug: 'ring-necked-duck',     name: 'Ring-necked Duck' },
  motduc:  { slug: 'mottled-duck',         name: 'Mottled Duck' },
  // Cackling geese are hunted as dark geese with Canadas (as the scrapers map them)
  cacgoo1: { slug: 'canada-goose',         name: 'Canada Goose' },
  y00470:  { slug: 'canada-goose',         name: 'Canada Goose' },  // Cackling/Canada Goose
  // Snow x Ross's hybrid and Snow/Ross's — count toward snow goose
  sxrgoo1: { slug: 'snow-goose',           name: 'Snow Goose' },
  y00469:  { slug: 'snow-goose',           name: 'Snow Goose' },
  scaup:   { slug: 'scaup',                name: 'Scaup' },  // Greater/Lesser Scaup
  y00314:  { slug: 'blue-winged-teal',     name: 'Blue-winged Teal' },  // Blue-winged/Cinnamon Teal
  // Teal sp. — count toward green-winged as most common
  teal:    { slug: 'green-winged-teal',    name: 'Green-winged Teal' },
}
// Codes checked against eBird's /ref/taxonomy/ebird on 2026-10-27. Six were wrong before
// (ambwig, blwtea, rossgo, mottdu, sxrgoo, teal1), so wigeon, blue-winged teal, Ross's
// goose and mottled duck sightings were silently dropped. ebird.test.ts pins the list.
export const EBIRD_SPECIES_CODES = Object.keys(EBIRD_SPECIES)

// ─── State → flyway mapping (V1 states) ──────────────────────────────────────

export const STATE_FLYWAY: Record<string, string> = {
  TX: 'central', NM: 'central', KS: 'central', OK: 'central',
  AR: 'mississippi', LA: 'mississippi', MO: 'mississippi',
  IL: 'mississippi', // INHS Forbes aerial inventory; not in the default eBird state list
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function computeTrend(delta: number, deltaPercent: number | null): 'increasing' | 'decreasing' | 'stable' {
  const absPct = deltaPercent !== null ? Math.abs(deltaPercent) : null
  if (absPct !== null && absPct < 5) return 'stable'
  return delta > 0 ? 'increasing' : 'decreasing'
}

// Activity level thresholds — applied to a species' birds in each place's latest report
// statewide (ebird-activity.ts). Conservative starting points, not statistically derived.
// ebird_activity_snapshots now keeps one row per state, species and day: after a season,
// derive p50/p75/p90 breakpoints per species per state from it. Snow geese run much
// higher than diving ducks, so per-species thresholds would be more accurate.
export function computeActivityLevel(count: number): 'high' | 'moderate' | 'low' {
  if (count >= 5000) return 'high'
  if (count >= 500) return 'moderate'
  return 'low'
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EBirdCount {
  refugeId: string                  // locationId (collapses with official rows in dashboard)
  refugeName: string
  state: string
  flyway: string | null
  centerPoint: { lat: number; lng: number }
  species: string                   // our slug
  speciesName: string
  count: number                     // latest report within the radius, last 14 days
  surveyDate: string                // that report's date (YYYY-MM-DD)
  surveyType: 'ebird_recent'
  source: 'ebird'
  previousCount: number | null
  previousDate: string | null
  delta: number | null
  deltaPercent: number | null
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
}


export interface EBirdObservation {
  speciesCode: string
  comName: string
  howMany: number | null
  obsDt: string
  locId: string
  locName: string
  obsValid: boolean
  /** A personal location (often a home address or yard), not a public hotspot */
  locationPrivate?: boolean
}

// ─── Per-location geo fetch (25km radius by default, up to eBird's 50km max) ──

const MIN_COUNT = 5  // ignore very small/incidental sightings

export async function getEBirdCountsForRefuge(
  locationId: string,
  refugeName: string,
  state: string,
  flyway: string | null,
  lat: number,
  lng: number,
  radiusKm = 25,
): Promise<EBirdCount[]> {
  const apiKey = process.env.EBIRD_API_KEY
  if (!apiKey) return []

  const dist = Math.min(Math.max(Math.round(radiusKm), 1), 50)  // eBird caps geo queries at 50km
  const cacheKey = `ebird:obs:${lat.toFixed(2)}:${lng.toFixed(2)}:${dist}`
  const cached = obsCache.get(cacheKey)
  if (cached) return cached

  try {
    const url = new URL(`${EBIRD_BASE}/data/obs/geo/recent`)
    url.searchParams.set('lat', lat.toFixed(4))
    url.searchParams.set('lng', lng.toFixed(4))
    url.searchParams.set('dist', String(dist))
    url.searchParams.set('back', '14')
    // No 'cat' filter — eBird's category enum doesn't include 'waterfowl'.
    // Filter client-side via EBIRD_SPECIES whitelist (only waterfowl slugs).
    url.searchParams.set('maxResults', '2000')

    // eBird answers bursts with 429 (its limits are unpublished): back off and retry
    // rather than show the location as empty.
    let resp: Response | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * 2 ** (attempt - 1)))
      resp = await fetch(url.toString(), {
        headers: {
          'X-eBirdApiToken': apiKey,
          'User-Agent': '(HuntStack, huntstack.com)',
        },
      })
      if (resp.status !== 429) break
    }
    if (!resp) return []

    if (!resp.ok) {
      // Logged, not thrown: one failed location must not blank the dashboard — but it must not
      // be invisible either (callers can't tell an error from a location with no sightings).
      console.warn(`[eBird] geo query for ${refugeName} failed: HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`)
      return []
    }

    const obs: EBirdObservation[] = await resp.json()

    if (obs.length === 2000) {
      console.warn(`[eBird] geo query at ${lat.toFixed(2)},${lng.toFixed(2)} hit maxResults=2000 — data may be truncated`)
    }

    // One observation per species comes back: the latest report within the radius (several
    // codes can map to one species, e.g. Snow Goose and Snow/Ross's Goose; keep the largest).
    // There is no earlier report to compare with, so these rows carry no trend: the old
    // days 15-28 "previous" window could only hold species with no report since, which left
    // every row reading "First survey".
    const latest = new Map<string, { slug: string; name: string; count: number; date: string }>()
    for (const o of obs) {
      const mapped = EBIRD_SPECIES[o.speciesCode]
      if (!mapped) continue
      if (o.howMany === null || o.howMany === undefined) continue  // presence-only
      if (!o.obsValid) continue  // skip flagged records
      const existing = latest.get(mapped.slug)
      if (!existing || o.howMany > existing.count) {
        latest.set(mapped.slug, { slug: mapped.slug, name: mapped.name, count: o.howMany, date: o.obsDt.substring(0, 10) })
      }
    }

    const result: EBirdCount[] = []
    for (const r of latest.values()) {
      if (r.count < MIN_COUNT) continue
      result.push({
        refugeId: locationId,
        refugeName,
        state,
        flyway,
        centerPoint: { lat, lng },
        species: r.slug,
        speciesName: r.name,
        count: r.count,
        surveyDate: r.date,
        surveyType: 'ebird_recent',
        source: 'ebird',
        previousCount: null,
        previousDate: null,
        delta: null,
        deltaPercent: null,
        trend: 'new',
      })
    }

    obsCache.set(cacheKey, result, GEO_TTL)
    return result

  } catch (err) {
    console.warn(`[eBird] geo query for ${refugeName} threw: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

// ─── Species reports by place (chat) ─────────────────────────────────────────
// eBird's statewide /data/obs/{region}/recent returns only the latest report of each species
// in the whole state (488 rows for Texas over 30 days, one of them a snow goose). Asked per
// species, /data/obs/{region}/recent/{species} returns the latest report at every place, which
// is what "where are the snow geese right now?" needs.

export interface EBirdSpeciesReport {
  state: string
  species: string        // slug
  speciesName: string
  /** Places with a report in the window */
  places: number
  /** Birds in each place's latest report, added up (presence-only reports count 0) */
  birds: number
  /** Up to 3 places with the largest latest report, largest first */
  topPlaces: Array<{ name: string; count: number; date: string }>
}

const speciesCache = new BoundedCache<EBirdObservation[]>()
// The background refresh and a page load can ask for the same state and species at once
const inFlight = new Map<string, Promise<EBirdObservation[]>>()

/** eBird codes per slug, primary code first (EBIRD_SPECIES order) */
function codesFor(slug: string): string[] {
  return Object.entries(EBIRD_SPECIES).filter(([, v]) => v.slug === slug).map(([code]) => code)
}

async function fetchSpeciesObs(apiKey: string, state: string, code: string, daysBack: number, fresh = false): Promise<EBirdObservation[]> {
  const key = `ebird:sp:US-${state}:${code}:${daysBack}d`
  if (!fresh) {
    const cached = speciesCache.get(key)
    if (cached) return cached
  }
  const pending = inFlight.get(key)
  if (pending) return pending
  const request = requestSpeciesObs(apiKey, state, code, daysBack, key).finally(() => inFlight.delete(key))
  inFlight.set(key, request)
  return request
}

async function requestSpeciesObs(apiKey: string, state: string, code: string, daysBack: number, key: string): Promise<EBirdObservation[]> {
  const url = `${EBIRD_BASE}/data/obs/US-${state}/recent/${code}?back=${daysBack}`
  let resp: Response | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * 2 ** (attempt - 1)))
    resp = await fetch(url, { headers: { 'X-eBirdApiToken': apiKey, 'User-Agent': '(HuntStack, huntstack.com)' } })
    if (resp.status !== 429) break
  }
  if (!resp || !resp.ok) {
    console.warn(`[eBird] species query US-${state}/${code} failed: HTTP ${resp?.status}`)
    return []
  }
  const obs: EBirdObservation[] = await resp.json()
  speciesCache.set(key, obs, SPECIES_TTL)
  return obs
}

const PUBLIC_LAND = /\b(NWR|national wildlife refuge|wildlife refuge|refuge|WMA|wildlife (management )?area|conservation area|CA|SFWA|state park|SP|state forest|national forest|NF|lake|reservoir|marsh|bottoms)\b/i
const LOOKS_PRIVATE = /^\s*\d|private|yard|home|house|backyard|farm\b/i

/**
 * The name to show for a place, or null to leave it unnamed. Hotspots are public. A personal
 * location is shown only when it names public land ("Swan Lake National Wildlife Refuge, Sumner
 * US-MO" - a birder's own pin on the refuge); street addresses ("11100-11118 N Cattle Dr"),
 * yards and anything marked private stay unnamed. Personal names keep only their first part,
 * dropping the town and coordinates eBird appends.
 */
export function publicPlaceName(locName: string, isPrivate: boolean): string | null {
  if (!isPrivate) return locName
  const first = locName.split(',')[0].trim()
  if (LOOKS_PRIVATE.test(locName) || !PUBLIC_LAND.test(first)) return null
  return first
}

/** Group reports by state and slug; the largest latest report per place */
export function summarizeSpeciesReports(
  rows: Array<{ state: string; obs: EBirdObservation[] }>,
): EBirdSpeciesReport[] {
  const groups = new Map<string, { state: string; slug: string; name: string; places: Map<string, { count: number; date: string; private: boolean }> }>()
  for (const { state, obs } of rows) {
    for (const o of obs) {
      const mapped = EBIRD_SPECIES[o.speciesCode]
      if (!mapped || !o.locName) continue
      const key = `${state}:${mapped.slug}`
      if (!groups.has(key)) groups.set(key, { state, slug: mapped.slug, name: mapped.name, places: new Map() })
      const places = groups.get(key)!.places
      const count = o.howMany ?? 0  // "X" (present, not counted) still marks a place
      const best = places.get(o.locName)
      // Private places count toward `places`; publicPlaceName decides whether one is named
      if (!best || count > best.count) places.set(o.locName, { count, date: o.obsDt.substring(0, 10), private: o.locationPrivate === true })
    }
  }
  return [...groups.values()].map(g => ({
    state: g.state,
    species: g.slug,
    speciesName: g.name,
    places: g.places.size,
    birds: [...g.places.values()].reduce((n, v) => n + v.count, 0),
    topPlaces: [...g.places.entries()]
      .map(([name, v]) => ({ name: publicPlaceName(name, v.private), count: v.count, date: v.date }))
      .filter((p): p is { name: string; count: number; date: string } => p.name !== null && p.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
  }))
}

/** Default species for "where are the ducks/geese right now?" with none named */
export const DEFAULT_REPORT_SPECIES = ['mallard', 'snow-goose', 'canada-goose', 'green-winged-teal', 'pintail']

/** Every waterfowl species we map, once each */
export const ALL_REPORT_SPECIES = [...new Set(Object.values(EBIRD_SPECIES).map(v => v.slug))]

/** The eBird codes asked for: every code (snow goose includes Snow/Ross's) for one or two
 *  species, the main code each for more. Stable, so cached requests are shared. */
export function reportCodes(speciesSlugs: string[]): string[] {
  return speciesSlugs.flatMap(s => (speciesSlugs.length <= 2 ? codesFor(s) : codesFor(s).slice(0, 1)))
}

export async function getEBirdSpeciesReports(
  stateCodes: string[],
  speciesSlugs: string[],
  daysBack = 14,
  options: { fresh?: boolean } = {},
): Promise<EBirdSpeciesReport[]> {
  const apiKey = process.env.EBIRD_API_KEY
  if (!apiKey || stateCodes.length === 0 || speciesSlugs.length === 0) return []
  const codes = reportCodes(speciesSlugs)
  const jobs = stateCodes.flatMap(state => codes.map(code => ({ state, code })))
  const rows: Array<{ state: string; obs: EBirdObservation[] }> = []
  // 3 at a time: eBird answers bursts with 429
  for (let i = 0; i < jobs.length; i += 3) {
    const batch = await Promise.all(jobs.slice(i, i + 3).map(async j => ({
      state: j.state,
      obs: await fetchSpeciesObs(apiKey, j.state, j.code, daysBack, options.fresh).catch(() => [] as EBirdObservation[]),
    })))
    rows.push(...batch)
  }
  return summarizeSpeciesReports(rows)
}
