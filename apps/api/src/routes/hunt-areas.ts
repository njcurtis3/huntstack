// GET /api/hunt/areas: Where to Hunt by area (lib/hunt-areas.ts). Gathers the evidence (survey
// counts, eBird reports, hunter reports), groups it into areas named after a nearby town, and
// ranks them with the season and the weather push.

import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { decodePoint } from '../lib/jsonb.js'
import { accessOf } from '../lib/access.js'
import { FRESH_DAYS, FRESH_DAYS_MONTHLY } from '../lib/freshness.js'
import { surveyChange } from '../lib/survey-change.js'
import { getPushFactorsForStates, pushFactorAt } from '../lib/weather.js'
import { STATE_FLYWAY, getEBirdHotspots } from '../lib/ebird.js'
import { BoundedCache } from '../lib/cache.js'
import {
  AREA_RADIUS_KM, clusterPoints, distanceKm, isSightingsOnly, mapLands, nameArea, publicLandsNear, rankAreas, sameUnit, scoreArea, summarizeArea,
  type AreaPoint, type AreaSeason, type CheckedPlace, type MapLand,
} from '../lib/hunt-areas.js'
import { findOpenSeason, huntZonesOf, seasonDisplayName, seasonYearOf, type SeasonRow } from './hunt.js'

const AREA_STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO', 'IL', 'IA']
const EBIRD_DAYS = 14
const REPORT_DAYS = 7
const EBIRD_WAIT_MS = 8000
const MAX_AREAS = 15
const PUSH_POINTS_PER_STATE = 6
// An area needs some birds or a few separate reports to be worth listing
const MIN_BIRDS = 100
const MIN_REPORTS = 3
// Field report sizes, by bucket, when the hunter gave no exact count
const BUCKET_BIRDS: Record<string, number> = { '1-10': 5, '10-50': 30, '50-200': 125, '200+': 300 }

const cache = new BoundedCache<unknown>(50)
const CACHE_MS = 15 * 60 * 1000
// The public land list changes only with a yearly data file or a new access check
const landsCache = new BoundedCache<{ lands: MapLand[]; source: string }>(1)
const LANDS_CACHE_MS = 6 * 60 * 60 * 1000

interface SurveyRow {
  location_id: string
  name: string
  center_point: unknown
  website_url: string | null
  metadata: unknown
  state_code: string
  species_slug: string
  species_name: string
  count: number
  survey_date: string | Date
  survey_type: string
  previous_count: number | null
  previous_date: string | Date | null
}

const day = (d: string | Date) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)
const miles = (km: number) => Math.round(km * 0.621371)

function areaTitle(town: ReturnType<typeof nameArea>, fallback: string): string {
  if (!town) return fallback
  const place = `${town.town}, ${town.state}`
  return town.distanceKm <= 8 ? `Near ${place}` : `${miles(town.distanceKm)} mi ${town.direction} of ${place}`
}

export const huntAreasRoutes: FastifyPluginAsync = async (app) => {
  app.get('/areas', {
    schema: {
      tags: ['hunt'],
      summary: 'Hunting areas ranked by birds counted nearby, their trend, the season and the weather',
      querystring: {
        type: 'object',
        properties: {
          species: { type: 'string', description: 'Species slug (e.g. mallard). Default: all ducks and geese' },
          states: { type: 'string', description: 'Comma-separated state codes. Default: every covered state' },
          date: { type: 'string', description: 'Hunt date YYYY-MM-DD (for the season). Default: today' },
          perState: { type: 'integer', minimum: 1, maximum: 5, description: 'Instead of the overall top 15, the best N areas in each state (the map uses 3)' },
        },
      },
    },
  }, async (request, reply) => {
    const q = request.query as { species?: string; states?: string; date?: string; perState?: number }
    const perState = q.perState ? Math.min(5, Math.max(1, Math.trunc(q.perState))) : undefined
    const target = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? new Date(`${q.date}T12:00:00Z`) : new Date()
    if (Number.isNaN(target.getTime())) return reply.status(400).send({ error: true, message: 'date must be YYYY-MM-DD' })
    const targetDay = target.toISOString().slice(0, 10)
    const states = q.states
      ? [...new Set(q.states.split(',').map(s => s.trim().toUpperCase()))].filter(s => AREA_STATES.includes(s))
      : AREA_STATES
    if (states.length === 0) return reply.status(400).send({ error: true, message: `states must include one of ${AREA_STATES.join(', ')}` })
    const speciesSlug = q.species?.trim() || null

    const cacheKey = `${states.join(',')}|${speciesSlug ?? '*'}|${targetDay}|${perState ?? 'top'}`
    const cached = cache.get(cacheKey)
    if (cached) return cached

    const db = getDb()
    const stateList = sql.join(states.map(s => sql`${s}`), sql`, `)
    // Counts describe now, whatever the hunt date
    const today = new Date().toISOString().slice(0, 10)

    // ── Survey counts: latest per species at each site, and the one before it ──
    const surveyRows = await db.execute(sql`
      WITH ranked AS (
        SELECT rc.location_id, rc.species_id, rc.count, rc.survey_date, rc.survey_type,
               l.name, l.center_point, l.website_url, l.metadata,
               s.code AS state_code, sp.slug AS species_slug, sp.name AS species_name,
               ROW_NUMBER() OVER (PARTITION BY rc.location_id, rc.species_id ORDER BY rc.survey_date DESC) AS rn
        FROM refuge_counts rc
        JOIN locations l ON l.id = rc.location_id
        JOIN states s ON s.id = l.state_id
        JOIN species sp ON sp.id = rc.species_id
        WHERE l.location_type = 'wildlife_refuge'
          AND l.name NOT LIKE '% - Statewide MWI'
          AND (l.metadata->>'survey_only') IS DISTINCT FROM 'true'
          AND rc.survey_type != 'mwi_annual'
          AND rc.survey_date <= ${today}::date
          AND rc.survey_date >= ${today}::date - INTERVAL '75 days'
          AND s.code IN (${stateList})
          AND ${speciesSlug ? sql`sp.slug = ${speciesSlug}` : sql`sp.category = 'waterfowl'`}
      )
      SELECT c.location_id, c.name, c.center_point, c.website_url, c.metadata, c.state_code,
             c.species_slug, c.species_name, c.count, c.survey_date, c.survey_type,
             p.count AS previous_count, p.survey_date AS previous_date
      FROM ranked c
      LEFT JOIN ranked p ON p.location_id = c.location_id AND p.species_id = c.species_id AND p.rn = 2
      WHERE c.rn = 1
        AND c.survey_date >= ${today}::date
          - (CASE WHEN c.survey_type = 'aerial_monthly' THEN ${FRESH_DAYS_MONTHLY}::int ELSE ${FRESH_DAYS}::int END) * INTERVAL '1 day'
    `) as unknown as SurveyRow[]

    // Statewide surveys (LDWF's monthly aerial survey) cover a whole region, not a point:
    // they are context for the state's areas, never an area of their own
    const statewide = new Map<string, { name: string; birds: number; date: string }>()
    const sites = new Map<string, AreaPoint>()
    for (const r of surveyRows) {
      if (r.survey_type === 'aerial_monthly') {
        const s = statewide.get(r.location_id) ?? { name: r.name, birds: 0, date: day(r.survey_date) }
        s.birds += r.count ?? 0
        statewide.set(r.location_id, s)
        continue
      }
      const point = decodePoint(r.center_point)
      if (!point) continue
      let site = sites.get(r.location_id)
      if (!site) {
        const access = accessOf(r.metadata)
        site = {
          kind: 'survey', id: r.location_id, name: r.name, state: r.state_code, lat: point.lat, lng: point.lng,
          birds: 0, comparableNow: 0, comparablePrevious: 0, date: null,
          access: access.access, accessNote: access.note, url: r.website_url, zones: huntZonesOf(r.metadata), species: [],
        }
        sites.set(r.location_id, site)
      }
      const count = r.count ?? 0
      site.birds += count
      const d = day(r.survey_date)
      if (!site.date || d > site.date) site.date = d
      if (count > 0) site.species.push({ slug: r.species_slug, name: r.species_name, count })
      const change = surveyChange(count, r.survey_date, r.previous_count, r.previous_date)
      if (change.previousCount !== null) {
        site.comparableNow += count
        site.comparablePrevious += change.previousCount
      }
    }
    const statewideByState = new Map<string, Array<{ name: string; birds: number; date: string }>>()
    for (const [id, s] of statewide) {
      const st = surveyRows.find(r => r.location_id === id)!.state_code
      statewideByState.set(st, [...(statewideByState.get(st) ?? []), s])
    }

    // ── eBird: public hotspots' latest report per species, last 14 days ──
    let ebirdPoints: AreaPoint[] = []
    let ebirdAvailable = !!process.env.EBIRD_API_KEY
    if (ebirdAvailable) {
      const ebirdStates = states.filter(s => STATE_FLYWAY[s])
      try {
        const hotspots = await Promise.race([
          getEBirdHotspots(ebirdStates, EBIRD_DAYS),
          new Promise<null>(resolve => setTimeout(() => resolve(null), EBIRD_WAIT_MS)),
        ])
        if (hotspots === null) ebirdAvailable = false
        else {
          ebirdPoints = hotspots.map(h => {
            const species = h.species
              .filter(sp => !speciesSlug || sp.slug === speciesSlug)
              .map(sp => ({ slug: sp.slug, name: sp.name, count: sp.count ?? 0 }))
            const dates = h.species.map(sp => sp.date).sort()
            return {
              kind: 'ebird' as const, id: `ebird:${h.id}`, name: h.name, state: h.state, lat: h.lat, lng: h.lng,
              birds: species.reduce((s, sp) => s + sp.count, 0), comparableNow: 0, comparablePrevious: 0,
              date: dates.length ? dates[dates.length - 1] : null,
              url: `https://ebird.org/hotspot/${h.id}`, species: species.filter(sp => sp.count > 0),
            }
          }).filter(p => !speciesSlug || p.birds > 0 || p.species.length > 0)
        }
      } catch (err) {
        request.log.warn({ err }, 'hunt areas: eBird hotspots unavailable')
        ebirdAvailable = false
      }
    }

    // ── Hunter reports: grid cells only, never the exact spot ──
    const reportRows = await db.execute(sql`
      SELECT lat_cell, lng_cell, species_slug, count_bucket, count_exact, observed_at
      FROM field_reports
      WHERE observed_at >= now() - ${REPORT_DAYS}::int * INTERVAL '1 day'
        ${speciesSlug ? sql`AND species_slug = ${speciesSlug}` : sql``}
    `) as unknown as Array<{ lat_cell: number; lng_cell: number; species_slug: string | null; count_bucket: string; count_exact: number | null; observed_at: string | Date }>
    const reportPoints: AreaPoint[] = reportRows.flatMap((r, i) => {
      const town = nameArea(r.lat_cell, r.lng_cell, '')
      if (!town || !states.includes(town.state)) return []
      return [{
        kind: 'report' as const, id: `report:${i}`, name: 'Hunter report', state: town.state,
        lat: r.lat_cell, lng: r.lng_cell, birds: r.count_exact ?? BUCKET_BIRDS[r.count_bucket] ?? 0,
        comparableNow: 0, comparablePrevious: 0, date: day(r.observed_at), species: [],
      }]
    })

    // ── Areas ──
    const groups = clusterPoints([...sites.values(), ...ebirdPoints, ...reportPoints], AREA_RADIUS_KM)
      .filter(g => {
        const birds = g.reduce((s, p) => s + p.birds, 0)
        return birds >= MIN_BIRDS || g.length >= MIN_REPORTS
      })

    // ── Seasons open on the hunt date, and which states we have dates for ──
    const seasonYear = seasonYearOf(target)
    const [seasonRows, seasonStates] = await Promise.all([
      db.execute(sql`
        SELECT s.code AS state_code, sp.slug AS species_slug, se.name AS season_name, se.start_date, se.end_date,
               se.bag_limit, se.metadata->>'appliesTo' AS applies_to, se.units->>0 AS zone
        FROM seasons se JOIN states s ON se.state_id = s.id JOIN species sp ON se.species_id = sp.id
        WHERE s.code IN (${stateList}) AND se.year = ${seasonYear}
          AND se.start_date <= ${targetDay}::date AND se.end_date >= ${targetDay}::date
          AND se.season_type IS DISTINCT FROM 'falconry' AND sp.category = 'waterfowl'
      `) as unknown as Promise<SeasonRow[]>,
      db.execute(sql`
        SELECT DISTINCT s.code AS state_code FROM seasons se JOIN states s ON se.state_id = s.id
        JOIN species sp ON se.species_id = sp.id
        WHERE s.code IN (${stateList}) AND se.year = ${seasonYear} AND sp.category = 'waterfowl'
      `) as unknown as Promise<Array<{ state_code: string }>>,
    ])
    const openSeasons = new Map<string, SeasonRow[]>()
    for (const sr of seasonRows) {
      const key = `${sr.state_code}:${sr.applies_to === 'ducks' ? '*ducks' : sr.species_slug}`
      openSeasons.set(key, [...(openSeasons.get(key) ?? []), sr])
    }
    const hasSeasonData = new Set(seasonStates.map(r => r.state_code))

    // ── Weather push: the largest few survey sites per state ──
    const pushCoords = new Map<string, { lat: number; lng: number }[]>()
    for (const st of states) {
      const pts = [...sites.values()].filter(p => p.state === st).sort((a, b) => b.birds - a.birds).slice(0, PUSH_POINTS_PER_STATE)
      if (pts.length) pushCoords.set(st, pts.map(p => ({ lat: p.lat, lng: p.lng })))
    }
    const push = await getPushFactorsForStates([...pushCoords.keys()], pushCoords)
      .catch(() => ({ pushFactors: [], regionalPushFactors: [], highPushStates: [] }))

    const scored = groups.map(points => {
      const summary = summarizeArea(points)
      const town = nameArea(summary.lat, summary.lng, summary.state)
      const zonesSet = new Set(points.flatMap(p => p.zones ?? []))
      const zones = zonesSet.size ? [...zonesSet] : null

      // Season: the species asked for, or ducks and geese
      const checks = speciesSlug
        ? [{ label: null as string | null, slug: speciesSlug }]
        : [{ label: 'Ducks', slug: 'mallard' }, { label: 'Geese', slug: 'snow-goose' }, { label: 'Geese', slug: 'canada-goose' }]
      const lines: string[] = []
      let anyOpen = false
      const seen = new Set<string>()
      for (const c of checks) {
        const open = findOpenSeason(openSeasons, summary.state, c.slug, zones)
        const key = c.label ?? c.slug
        if (open) {
          anyOpen = true
          if (!seen.has(key)) lines.push(`${c.label ? `${c.label}: ` : ''}${seasonDisplayName(open)}`)
          seen.add(key)
        }
      }
      const season: AreaSeason = anyOpen ? 'open' : hasSeasonData.has(summary.state) ? 'closed' : 'unknown'

      const pf = pushFactorAt(summary.state, { lat: summary.lat, lng: summary.lng }, push.pushFactors, push.regionalPushFactors)
      const pushScore = pf?.pushScore ?? 0

      const reasons: string[] = []
      if (summary.surveySites > 0) {
        reasons.push(`${summary.surveyBirds.toLocaleString('en-US')} ducks and geese at ${summary.surveySites} survey site${summary.surveySites === 1 ? '' : 's'}`)
      }
      if (summary.change) {
        const p = summary.change.percent
        reasons.push(p >= 5 ? `Counts up ${p}% since the previous surveys` : p <= -5 ? `Counts down ${-p}% since the previous surveys` : 'Counts steady since the previous surveys')
      }
      if (summary.ebirdPlaces > 0) {
        reasons.push(`${summary.ebirdPlaces} eBird hotspot${summary.ebirdPlaces === 1 ? '' : 's'} with reports in the last ${EBIRD_DAYS} days${summary.ebirdBirds > 0 ? ` (${summary.ebirdBirds.toLocaleString('en-US')} birds)` : ''}`)
      }
      if (summary.hunterReports > 0) {
        reasons.push(`${summary.hunterReports} hunter report${summary.hunterReports === 1 ? '' : 's'} this week`)
      }
      if (pf?.coldFrontPresent) reasons.push('Cold front moving through: birds on the move')
      else if (pf?.coldFrontIncoming) reasons.push('Cold front on the way')
      for (const s of statewideByState.get(summary.state) ?? []) {
        reasons.push(`Statewide: ${s.name} counted ${s.birds.toLocaleString('en-US')} (${s.date})`)
      }

      const radiusKm = Math.round(Math.max(...points.map(p => distanceKm(summary.lat, summary.lng, p.lat, p.lng)), 5))
      // PAD-US knows public access, not hunting rules: where our own checked access says a unit is
      // closed or private (Clarence Cannon NWR: closed to migratory bird hunting), ours wins
      const closedHere = points.filter(p => p.kind === 'survey' && (p.access === 'closed' || p.access === 'private'))
      const lands = publicLandsNear(summary.lat, summary.lng, radiusKm, 8)
        .filter(l => !closedHere.some(p => sameUnit(l.name, p.name)))
        .slice(0, 6)
      if (lands.length > 0) {
        const furthest = Math.max(...lands.map(l => l.distanceKm))
        reasons.push(`${lands.length} public land unit${lands.length === 1 ? '' : 's'} within ${miles(furthest)} mi (wildlife areas, refuges, Corps land)`)
      }
      const sightingsOnly = isSightingsOnly(summary, lands.length)
      if (sightingsOnly) {
        reasons.push('Ranked lower: only birder sightings, with no survey site or public land nearby (often city parks and lakes)')
      }
      const score = scoreArea(summary, pushScore, season, sightingsOnly)

      const evidence = [...points].sort((a, b) => b.birds - a.birds)
      const place = (p: AreaPoint) => ({
        kind: p.kind,
        name: p.name,
        birds: p.birds,
        date: p.date,
        access: p.access ?? null,
        accessNote: p.accessNote ?? null,
        url: p.url ?? null,
        topSpecies: [...p.species].sort((a, b) => b.count - a.count).slice(0, 3),
      })
      return {
        id: `${summary.state}-${summary.lat.toFixed(2)}-${summary.lng.toFixed(2)}`,
        score,
        title: areaTitle(town, `${summary.state} area`),
        town: town?.town ?? null,
        townState: town?.state ?? null,
        county: town?.county ?? null,
        state: summary.state,
        flyway: STATE_FLYWAY[summary.state] ?? (summary.state === 'IA' ? 'mississippi' : null),
        center: { lat: summary.lat, lng: summary.lng },
        radiusKm,
        birds: summary.birds,
        surveyBirds: summary.surveyBirds,
        surveySites: summary.surveySites,
        ebirdBirds: summary.ebirdBirds,
        ebirdPlaces: summary.ebirdPlaces,
        hunterReports: summary.hunterReports,
        change: summary.change,
        latestDate: summary.latestDate,
        topSpecies: summary.topSpecies,
        season: { status: season, lines },
        push: pf ? { score: pushScore, coldFrontPresent: pf.coldFrontPresent, coldFrontIncoming: pf.coldFrontIncoming, region: pf.regionName ?? null } : null,
        reasons,
        // Public land from PAD-US (access, not hunting rules), then survey sites checked open to
        // hunting (lib/access.ts) that aren't already in that list
        // A survey site's own access note (lib/access.ts) carries over to the same unit here
        publicLands: lands.map(l => ({
          ...l,
          note: points.find(p => p.kind === 'survey' && p.accessNote && sameUnit(l.name, p.name))?.accessNote ?? null,
        })),
        huntable: evidence
          .filter(p => p.kind === 'survey' && (p.access === 'public' || p.access === 'limited'))
          .filter(p => !lands.some(l => sameUnit(l.name, p.name)))
          .map(place),
        evidence: evidence.slice(0, 8).map(place),
        evidenceCount: evidence.length,
      }
    })
      .sort((a, b) => b.score - a.score)
    const areas = rankAreas(scored, MAX_AREAS, perState)

    const result = {
      date: targetDay,
      species: speciesSlug,
      states,
      areaRadiusKm: AREA_RADIUS_KM,
      areas,
      totalAreas: groups.length,
      statesWithoutSeasonData: states.filter(s => !hasSeasonData.has(s)),
      sources: { surveys: sites.size, ebird: ebirdAvailable ? ebirdPoints.length : null, hunterReports: reportPoints.length },
    }
    cache.set(cacheKey, result, CACHE_MS)
    return result
  })

  // Public land for the Map's layer: USGS PAD-US units in the covered states, as compact rows
  app.get('/public-lands', {
    schema: {
      tags: ['hunt'],
      summary: 'Public land units (USGS PAD-US) for the map, with HuntStack access checks applied',
    },
  }, async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600')
    const cached = landsCache.get('all')
    if (cached) return cached
    const rows = await getDb().execute(sql`
      SELECT name, center_point, metadata FROM locations
      WHERE metadata->>'access' IS NOT NULL OR metadata->>'accessNote' IS NOT NULL
    `) as unknown as Array<{ name: string; center_point: unknown; metadata: unknown }>
    const checked: CheckedPlace[] = rows.flatMap(r => {
      const at = decodePoint(r.center_point)
      if (!at) return []
      const a = accessOf(r.metadata)
      return [{ name: r.name, lat: at.lat, lng: at.lng, access: a.access, note: a.note }]
    })
    const result = {
      lands: mapLands(checked),
      source: 'USGS Protected Areas Database (PAD-US) Public Access. Public access, not hunting rules.',
    }
    landsCache.set('all', result, LANDS_CACHE_MS)
    return result
  })
}

