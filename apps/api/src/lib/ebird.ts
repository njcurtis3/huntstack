// ─── eBird API v2 integration ─────────────────────────────────────────────────
// Provides recent community waterfowl observations near known refuges (geo),
// and statewide regional activity counts for V1 states.
// Data is live-fetched (no DB writes) with in-memory caches.
// Gracefully returns [] on any error — dashboard works without eBird data.
//
// API docs: https://documenter.getpostman.com/view/664302/S1ENwy59
// Auth: X-eBirdApiToken header (set EBIRD_API_KEY in .env)

const EBIRD_BASE = 'https://api.ebird.org/v2'
const GEO_TTL      = 6 * 60 * 60 * 1000  // 6 hours  — per-refuge geo queries
const REGIONAL_TTL = 3 * 60 * 60 * 1000  // 3 hours  — statewide region queries

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const obsCache      = new Map<string, CacheEntry<EBirdCount[]>>()
const regionalCache = new Map<string, CacheEntry<EBirdRegionalCount[]>>()

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// ─── eBird species code → HuntStack slug ─────────────────────────────────────
// eBird uses 6-letter alpha codes. Maps to our species slugs + display names.

const EBIRD_SPECIES: Record<string, { slug: string; name: string }> = {
  mallar3: { slug: 'mallard',              name: 'Mallard' },
  norpin:  { slug: 'pintail',              name: 'Northern Pintail' },
  snogoo:  { slug: 'snow-goose',           name: 'Snow Goose' },
  cangoo:  { slug: 'canada-goose',         name: 'Canada Goose' },
  gwfgoo:  { slug: 'white-fronted-goose',  name: 'Greater White-fronted Goose' },
  rossgo:  { slug: 'ross-goose',           name: "Ross's Goose" },
  gadwal:  { slug: 'gadwall',              name: 'Gadwall' },
  norsho:  { slug: 'northern-shoveler',    name: 'Northern Shoveler' },
  ambwig:  { slug: 'american-wigeon',      name: 'American Wigeon' },
  gnwtea:  { slug: 'green-winged-teal',    name: 'Green-winged Teal' },
  blwtea:  { slug: 'blue-winged-teal',     name: 'Blue-winged Teal' },
  canvas:  { slug: 'canvasback',           name: 'Canvasback' },
  redhea:  { slug: 'redhead',              name: 'Redhead' },
  lessca:  { slug: 'scaup',               name: 'Scaup' },
  gresca:  { slug: 'scaup',               name: 'Scaup' },
  buffle:  { slug: 'bufflehead',           name: 'Bufflehead' },
  rudduc:  { slug: 'ruddy-duck',           name: 'Ruddy Duck' },
  rinduc:  { slug: 'ring-necked-duck',     name: 'Ring-necked Duck' },
  mottdu:  { slug: 'mottled-duck',         name: 'Mottled Duck' },
  // Snow x Ross's hybrid — count toward snow goose
  sxrgoo:  { slug: 'snow-goose',           name: 'Snow Goose' },
  // Teal sp. — count toward green-winged as most common
  teal1:   { slug: 'green-winged-teal',    name: 'Green-winged Teal' },
}

// ─── State → flyway mapping (V1 states) ──────────────────────────────────────

export const STATE_FLYWAY: Record<string, string> = {
  TX: 'central', NM: 'central', KS: 'central', OK: 'central',
  AR: 'mississippi', LA: 'mississippi', MO: 'mississippi',
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

interface EBirdObservation {
  speciesCode: string
  comName: string
  howMany: number | null
  obsDt: string
  locId: string
  locName: string
  obsValid: boolean
}

// ─── Per-refuge geo fetch (25km radius) ──────────────────────────────────────

const MIN_COUNT = 5  // ignore very small/incidental sightings

export async function getEBirdCountsForRefuge(
  locationId: string,
  refugeName: string,
  state: string,
  flyway: string | null,
  lat: number,
  lng: number,
): Promise<EBirdCount[]> {
  const apiKey = process.env.EBIRD_API_KEY
  if (!apiKey) return []

  const cacheKey = `ebird:obs:${lat.toFixed(2)}:${lng.toFixed(2)}`
  const cached = getCached(obsCache, cacheKey)
  if (cached) return cached

  try {
    const url = new URL(`${EBIRD_BASE}/data/obs/geo/recent`)
    url.searchParams.set('lat', lat.toFixed(4))
    url.searchParams.set('lng', lng.toFixed(4))
    url.searchParams.set('dist', '25')      // 25km radius
    url.searchParams.set('back', '28')      // 28 days — fetch both periods in one call
    // No 'cat' filter — eBird's category enum doesn't include 'waterfowl'.
    // Filter client-side via EBIRD_SPECIES whitelist (only waterfowl slugs).
    url.searchParams.set('maxResults', '2000')

    const resp = await fetch(url.toString(), {
      headers: {
        'X-eBirdApiToken': apiKey,
        'User-Agent': '(HuntStack, huntstack.app)',
      },
    })

    if (!resp.ok) return []

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

    setCache(obsCache, cacheKey, result, GEO_TTL)
    return result

  } catch {
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
    const cached = getCached(regionalCache, key)
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
          'User-Agent': '(HuntStack, huntstack.app)',
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
      setCache(regionalCache, key, result.value.counts, REGIONAL_TTL)
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
