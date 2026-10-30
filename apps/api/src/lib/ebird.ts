// ─── eBird API v2 integration ─────────────────────────────────────────────────
// Provides recent community waterfowl observations near known refuges (geo),
// and statewide regional activity counts for V1 states.
// Data is live-fetched (no DB writes) with in-memory caches.
// Gracefully returns [] on any error — dashboard works without eBird data.
//
// API docs: https://documenter.getpostman.com/view/664302/S1ENwy59
// Auth: X-eBirdApiToken header (set EBIRD_API_KEY in .env)

import { BoundedCache } from './cache.js'

const EBIRD_BASE = 'https://api.ebird.org/v2'
const GEO_TTL      = 6 * 60 * 60 * 1000  // 6 hours  — per-refuge geo queries
const REGIONAL_TTL = 3 * 60 * 60 * 1000  // 3 hours  — statewide region queries

// ─── Cache ────────────────────────────────────────────────────────────────────

const obsCache      = new BoundedCache<EBirdCount[]>()
const regionalCache = new BoundedCache<EBirdRegionalCount[]>()

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

function getCutoffDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)  // YYYY-MM-DD
}

function computeTrend(delta: number, deltaPercent: number | null): 'increasing' | 'decreasing' | 'stable' {
  const absPct = deltaPercent !== null ? Math.abs(deltaPercent) : null
  if (absPct !== null && absPct < 5) return 'stable'
  return delta > 0 ? 'increasing' : 'decreasing'
}

// Activity level thresholds — applied to per-species counts within a 14-day window.
// These are intentionally conservative starting points, not statistically derived.
// eBird data is never persisted to DB so we can't calibrate offline.
// To recalibrate: log live API responses for a full season and derive p50/p75/p90
// breakpoints per species per state. Snow geese counts run much higher than
// diving ducks, so per-species thresholds would be more accurate long-term.
function computeActivityLevel(count: number): 'high' | 'moderate' | 'low' {
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
  count: number                     // sum of howMany in current 14-day window
  surveyDate: string                // most recent obsDt in current window (YYYY-MM-DD)
  surveyType: 'ebird_recent'
  source: 'ebird'
  previousCount: number | null
  previousDate: string | null
  delta: number | null
  deltaPercent: number | null
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
}

export interface EBirdRegionalCount {
  state: string
  flyway: string | null
  species: string                   // slug
  speciesName: string
  currentCount: number              // sum howMany days 1-14
  previousCount: number | null      // sum howMany days 15-30
  delta: number | null
  deltaPercent: number | null
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
  activityLevel: 'high' | 'moderate' | 'low'
  fetchedAt: string
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
    url.searchParams.set('back', '28')      // 28 days — fetch both periods in one call
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

    // Split into current (days 1-14) and previous (days 15-28) windows
    const cutoff = getCutoffDate(14)

    const current = new Map<string, { slug: string; name: string; total: number; latestDate: string }>()
    const previous = new Map<string, { slug: string; name: string; total: number; latestDate: string }>()

    for (const o of obs) {
      const mapped = EBIRD_SPECIES[o.speciesCode]
      if (!mapped) continue
      if (o.howMany === null || o.howMany === undefined) continue  // presence-only
      if (!o.obsValid) continue  // skip flagged records

      const dateStr = o.obsDt.substring(0, 10)
      const bucket = dateStr >= cutoff ? current : previous

      const existing = bucket.get(mapped.slug)
      if (existing) {
        existing.total += o.howMany
        if (dateStr > existing.latestDate) existing.latestDate = dateStr
      } else {
        bucket.set(mapped.slug, { slug: mapped.slug, name: mapped.name, total: o.howMany, latestDate: dateStr })
      }
    }

    const result: EBirdCount[] = []
    for (const [slug, curr] of current) {
      if (curr.total < MIN_COUNT) continue

      const prev = previous.get(slug)
      const previousCount = prev?.total ?? null
      const previousDate = prev ? prev.latestDate : null

      let delta: number | null = null
      let deltaPercent: number | null = null
      let trend: EBirdCount['trend'] = 'new'

      if (previousCount !== null) {
        delta = curr.total - previousCount
        deltaPercent = previousCount !== 0
          ? Math.round(((curr.total - previousCount) / previousCount) * 1000) / 10
          : null
        trend = computeTrend(delta, deltaPercent)
      }

      result.push({
        refugeId: locationId,
        refugeName,
        state,
        flyway,
        centerPoint: { lat, lng },
        species: curr.slug,
        speciesName: curr.name,
        count: curr.total,
        surveyDate: curr.latestDate,
        surveyType: 'ebird_recent',
        source: 'ebird',
        previousCount,
        previousDate,
        delta,
        deltaPercent,
        trend,
      })
    }

    obsCache.set(cacheKey, result, GEO_TTL)
    return result

  } catch (err) {
    console.warn(`[eBird] geo query for ${refugeName} threw: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

// ─── Statewide regional counts ────────────────────────────────────────────────
// Uses eBird region endpoint (US-TX, US-NM, etc.) to get all community
// observations statewide. Fetches back=30 days and splits by date window.

export async function getEBirdRegionalCounts(
  stateCodes: string[],
  speciesSlugs?: string[],
  daysBack: number = 30,
): Promise<EBirdRegionalCount[]> {
  const apiKey = process.env.EBIRD_API_KEY
  if (!apiKey) return []

  const cutoff = getCutoffDate(14)  // current = days 1-14, previous = days 15-30
  const fetchedAt = new Date().toISOString()

  // Check cache per state; collect cache misses
  const cachedResults: EBirdRegionalCount[] = []
  const statesToFetch: string[] = []

  for (const stateCode of stateCodes) {
    const key = `ebird:region:US-${stateCode}:${daysBack}d`
    const cached = regionalCache.get(key)
    if (cached) {
      cachedResults.push(...cached)
    } else {
      statesToFetch.push(stateCode)
    }
  }

  if (statesToFetch.length === 0) {
    return filterBySpecies(cachedResults, speciesSlugs)
  }

  // Fetch cache-miss states in parallel
  const fetchResults = await Promise.allSettled(
    statesToFetch.map(async (stateCode) => {
      const url = new URL(`${EBIRD_BASE}/data/obs/US-${stateCode}/recent`)
      url.searchParams.set('back', String(daysBack))
      url.searchParams.set('maxResults', '10000')

      const resp = await fetch(url.toString(), {
        headers: {
          'X-eBirdApiToken': apiKey,
          'User-Agent': '(HuntStack, huntstack.com)',
        },
      })

      if (!resp.ok) return { stateCode, counts: [] as EBirdRegionalCount[] }

      const obs: EBirdObservation[] = await resp.json()

      if (obs.length === 10000) {
        console.warn(`[eBird] region US-${stateCode} back=${daysBack} hit maxResults=10000 — data may be truncated`)
      }

      // Aggregate by species into current and previous windows
      const currBucket = new Map<string, { slug: string; name: string; total: number }>()
      const prevBucket = new Map<string, { slug: string; name: string; total: number }>()

      for (const o of obs) {
        const mapped = EBIRD_SPECIES[o.speciesCode]
        if (!mapped) continue
        if (o.howMany === null || o.howMany === undefined) continue
        // Note: do NOT filter obsValid for regional data — high validity rate statewide

        const dateStr = o.obsDt.substring(0, 10)
        const bucket = dateStr >= cutoff ? currBucket : prevBucket

        const existing = bucket.get(mapped.slug)
        if (existing) {
          existing.total += o.howMany
        } else {
          bucket.set(mapped.slug, { slug: mapped.slug, name: mapped.name, total: o.howMany })
        }
      }

      const counts: EBirdRegionalCount[] = []
      for (const [slug, curr] of currBucket) {
        const prev = prevBucket.get(slug)
        const previousCount = prev?.total ?? null

        let delta: number | null = null
        let deltaPercent: number | null = null
        let trend: EBirdRegionalCount['trend'] = 'new'

        if (previousCount !== null) {
          delta = curr.total - previousCount
          deltaPercent = previousCount !== 0
            ? Math.round(((curr.total - previousCount) / previousCount) * 1000) / 10
            : null
          trend = computeTrend(delta, deltaPercent)
        }

        counts.push({
          state: stateCode,
          flyway: STATE_FLYWAY[stateCode] ?? null,
          species: curr.slug,
          speciesName: curr.name,
          currentCount: curr.total,
          previousCount,
          delta,
          deltaPercent,
          trend,
          activityLevel: computeActivityLevel(curr.total),
          fetchedAt,
        })
      }

      return { stateCode, counts }
    })
  )

  // Store per-state results in cache and collect
  const freshResults: EBirdRegionalCount[] = []
  for (let i = 0; i < statesToFetch.length; i++) {
    const result = fetchResults[i]
    if (result.status === 'fulfilled') {
      const key = `ebird:region:US-${result.value.stateCode}:${daysBack}d`
      regionalCache.set(key, result.value.counts, REGIONAL_TTL)
      freshResults.push(...result.value.counts)
    }
    // Silently skip failed states — partial results are better than nothing
  }

  return filterBySpecies([...cachedResults, ...freshResults], speciesSlugs)
}

function filterBySpecies(counts: EBirdRegionalCount[], slugs?: string[]): EBirdRegionalCount[] {
  if (!slugs || slugs.length === 0) return counts
  return counts.filter(c => slugs.includes(c.species))
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
  /** Up to 3 places with the largest latest report, largest first */
  topPlaces: Array<{ name: string; count: number; date: string }>
}

const speciesCache = new BoundedCache<EBirdObservation[]>()

/** eBird codes per slug, primary code first (EBIRD_SPECIES order) */
function codesFor(slug: string): string[] {
  return Object.entries(EBIRD_SPECIES).filter(([, v]) => v.slug === slug).map(([code]) => code)
}

async function fetchSpeciesObs(apiKey: string, state: string, code: string, daysBack: number): Promise<EBirdObservation[]> {
  const key = `ebird:sp:US-${state}:${code}:${daysBack}d`
  const cached = speciesCache.get(key)
  if (cached) return cached
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
  speciesCache.set(key, obs, REGIONAL_TTL)
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
    topPlaces: [...g.places.entries()]
      .map(([name, v]) => ({ name: publicPlaceName(name, v.private), count: v.count, date: v.date }))
      .filter((p): p is { name: string; count: number; date: string } => p.name !== null && p.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
  }))
}

/** Default species for "where are the ducks/geese right now?" with none named */
export const DEFAULT_REPORT_SPECIES = ['mallard', 'snow-goose', 'canada-goose', 'green-winged-teal', 'pintail']

export async function getEBirdSpeciesReports(
  stateCodes: string[],
  speciesSlugs: string[],
  daysBack = 14,
): Promise<EBirdSpeciesReport[]> {
  const apiKey = process.env.EBIRD_API_KEY
  if (!apiKey || stateCodes.length === 0 || speciesSlugs.length === 0) return []
  // Every code (snow goose includes Snow/Ross's reports) for one or two species; only the
  // main code for more, to keep the request count down.
  const codes = speciesSlugs.flatMap(s => (speciesSlugs.length <= 2 ? codesFor(s) : codesFor(s).slice(0, 1)))
  const jobs = stateCodes.flatMap(state => codes.map(code => ({ state, code })))
  const rows: Array<{ state: string; obs: EBirdObservation[] }> = []
  // 3 at a time: eBird answers bursts with 429
  for (let i = 0; i < jobs.length; i += 3) {
    const batch = await Promise.all(jobs.slice(i, i + 3).map(async j => ({
      state: j.state,
      obs: await fetchSpeciesObs(apiKey, j.state, j.code, daysBack).catch(() => [] as EBirdObservation[]),
    })))
    rows.push(...batch)
  }
  return summarizeSpeciesReports(rows)
}
