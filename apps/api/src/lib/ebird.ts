// ─── eBird API v2 integration ─────────────────────────────────────────────────
// Provides recent community waterfowl observations near known refuges.
// Data is live-fetched (no DB writes) with a 6-hour in-memory cache.
// Gracefully returns [] on any error — dashboard works without eBird data.
//
// API docs: https://documenter.getpostman.com/view/664302/S1ENwy59
// Auth: X-eBirdApiToken header (set EBIRD_API_KEY in .env)

const EBIRD_BASE = 'https://api.ebird.org/v2'
const OBS_TTL = 6 * 60 * 60 * 1000  // 6 hours

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const obsCache = new Map<string, CacheEntry<EBirdCount[]>>()

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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EBirdCount {
  refugeId: string                  // synthetic: "ebird-{locationId}"
  refugeName: string
  state: string
  flyway: string | null
  centerPoint: { lat: number; lng: number }
  species: string                   // our slug
  speciesName: string
  count: number                     // sum of howMany across all checklists
  surveyDate: string                // most recent obsDt (YYYY-MM-DD)
  surveyType: 'ebird_recent'
  source: 'ebird'
  previousCount: null
  previousDate: null
  delta: null
  deltaPercent: null
  trend: 'new'
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

// ─── Fetch ────────────────────────────────────────────────────────────────────

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
    url.searchParams.set('back', '14')       // last 14 days
    // No 'cat' filter — eBird's category enum doesn't include 'waterfowl'.
    // Filter client-side via EBIRD_SPECIES whitelist (only waterfowl slugs).
    url.searchParams.set('maxResults', '500')

    const resp = await fetch(url.toString(), {
      headers: {
        'X-eBirdApiToken': apiKey,
        'User-Agent': '(HuntStack, huntstack.app)',
      },
    })

    if (!resp.ok) {
      return []
    }

    const obs: EBirdObservation[] = await resp.json()

    // Aggregate by species slug: sum counts, track latest date
    const bySlug = new Map<string, { slug: string; name: string; total: number; latestDate: string }>()

    for (const o of obs) {
      const mapped = EBIRD_SPECIES[o.speciesCode]
      if (!mapped) continue
      if (o.howMany === null || o.howMany === undefined) continue  // presence-only
      if (!o.obsValid) continue  // skip flagged records

      const existing = bySlug.get(mapped.slug)
      if (existing) {
        existing.total += o.howMany
        if (o.obsDt > existing.latestDate) existing.latestDate = o.obsDt
      } else {
        bySlug.set(mapped.slug, {
          slug: mapped.slug,
          name: mapped.name,
          total: o.howMany,
          latestDate: o.obsDt.substring(0, 10), // YYYY-MM-DD
        })
      }
    }

    const result: EBirdCount[] = []
    for (const [, entry] of bySlug) {
      if (entry.total < MIN_COUNT) continue
      result.push({
        refugeId: locationId,  // same as official rows → collapses into same refuge group
        refugeName,
        state,
        flyway,
        centerPoint: { lat, lng },
        species: entry.slug,
        speciesName: entry.name,
        count: entry.total,
        surveyDate: entry.latestDate,
        surveyType: 'ebird_recent',
        source: 'ebird',
        previousCount: null,
        previousDate: null,
        delta: null,
        deltaPercent: null,
        trend: 'new',
      })
    }

    setCache(obsCache, cacheKey, result, OBS_TTL)
    return result

  } catch {
    return []
  }
}
