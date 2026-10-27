import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { getHuntingConditions, getPushFactorsForStates, pushFactorAt } from '../lib/weather.js'
import { decodeJsonbField, decodePoint } from '../lib/jsonb.js'
import { FRESH_DAYS, FRESH_DAYS_MONTHLY } from '../lib/freshness.js'

const V1_STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO']

// ─── Scoring weights ──────────────────────────────────────────────────────────

const TREND_SCORES: Record<string, number> = {
  increasing: 25,
  stable: 15,
  new: 10,
  decreasing: 5,
  no_data: 0,
}

const WEATHER_SCORES: Record<string, number> = {
  excellent: 15,
  good: 10,
  fair: 5,
  poor: 0,
}

// pushScore 0–3 → migration pressure score 0–10 (see getPushFactorsForStates
// in lib/weather.ts: coldFrontPresent(1) and coldFrontIncoming(0.5) are
// mutually exclusive, so 3.5 — both a present front and an incoming one —
// can never actually occur; max is coldFrontPresent + northWind + subFreezing = 3)
const PUSH_SCORES: Record<number, number> = { 0: 0, 0.5: 2, 1: 4, 1.5: 5, 2: 7, 2.5: 8, 3: 10 }

// migrationStatus → score 0–10
const MIGRATION_STATUS_SCORES: Record<string, number> = {
  arriving: 10,
  building: 7,
  peak: 5,
  declining: 2,
  departing: 0,
  first_survey: 6,
  no_data: 0,
}

export function getMigrationStatus(
  trend: string,
  deltaPercent: number | null,
): 'arriving' | 'building' | 'peak' | 'declining' | 'departing' | 'first_survey' | 'no_data' {
  if (trend === 'new') return 'first_survey'
  if (trend === 'no_data') return 'no_data'
  if (trend === 'increasing') return (deltaPercent !== null && deltaPercent > 20) ? 'arriving' : 'building'
  if (trend === 'stable') return 'peak'
  if (trend === 'decreasing') return (deltaPercent !== null && deltaPercent < -20) ? 'departing' : 'declining'
  return 'no_data'
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CountRow {
  location_id: string
  location_name: string
  location_type: string
  state_code: string
  state_id: string
  center_point: { lat: number; lng: number } | null
  website_url: string | null
  location_metadata: Record<string, unknown> | null
  species_slug: string
  species_name: string
  count: number | null
  survey_date: string | null
  survey_type: string | null
  previous_count: number | null
}

export interface SeasonRow {
  state_code: string
  species_slug: string
  season_name: string
  start_date: string
  end_date: string
  bag_limit: unknown
  applies_to: string | null
  zone: string | null
  // Set by findOpenSeason. zone_matched: the season's zone is one the location is known to be
  // in (locations.metadata.huntZones), so its name and dates apply there. other_zones_open: the
  // location's zones are unknown and seasons are open in more than one zone, so the card must
  // not show one zone's dates.
  zone_matched?: boolean
  other_zones_open?: boolean
}

const isStatewide = (zone: string | null) => !zone || /statewide/i.test(zone)

/** locations.metadata.huntZones: the season zone names (seasons.units) a location lies in. */
export function huntZonesOf(metadata: unknown): string[] | null {
  const zones = decodeJsonbField<Record<string, unknown>>(metadata)?.huntZones
  return Array.isArray(zones) && zones.length > 0 && zones.every(z => typeof z === 'string') ? zones as string[] : null
}

// Seasons that cover every duck are stored once (metadata.appliesTo = 'ducks', anchored on
// mallard because seasons.species_id is required) rather than once per species. A duck with
// no season of its own falls back to its state's all-duck season. Geese never do, and neither
// do dusky ducks: they open later than the other ducks, so the fallback would show them open
// during their closed first days.
const ALL_DUCKS_KEY = '*ducks'
const NO_DUCK_FALLBACK = new Set(['canada-goose', 'snow-goose', 'ross-goose', 'white-fronted-goose', 'mottled-duck'])

// seasons: every season open on the target date, keyed `${state}:${species}` (or the all-duck key).
// zones: the location's zones, or null when it hasn't been mapped. A mapped location only sees
// statewide seasons and seasons in its own zones; a species whose own seasons are all in other
// zones (e.g. NM Pacific Flyway scaup at a Central Flyway refuge) falls back to the all-duck season.
export function findOpenSeason(
  seasons: Map<string, SeasonRow[]>,
  stateCode: string,
  speciesSlug: string,
  zones: string[] | null = null,
): SeasonRow | null {
  const pick = (rows: SeasonRow[] | undefined): SeasonRow | null => {
    if (!rows || rows.length === 0) return null
    if (zones) {
      const hit = rows.find(r => isStatewide(r.zone) || zones.includes(r.zone!))
      return hit ? { ...hit, zone_matched: true } : null
    }
    const first = rows[0]
    return rows.some(r => r.zone !== first.zone) ? { ...first, other_zones_open: true } : first
  }
  const own = pick(seasons.get(`${stateCode}:${speciesSlug}`))
  if (own) return own
  if (NO_DUCK_FALLBACK.has(speciesSlug)) return null
  return pick(seasons.get(`${stateCode}:${ALL_DUCKS_KEY}`))
}

// For a location with no zone mapping, a season open in only part of the state must not be
// shown as open there: it may sit in another zone. Returns the card's season name.
export function seasonDisplayName(season: SeasonRow | null): string | null {
  if (!season) return null
  if (season.zone_matched) return season.season_name
  if (season.other_zones_open) return "Open in some zones — check your zone's dates"
  if (!isStatewide(season.zone)) return `Open only in ${season.zone} — check your zone's dates`
  return season.season_name
}

/** True when the card should show the season's own dates (zone matched, statewide, or no zone recorded). */
export function seasonDatesApply(season: SeasonRow | null): boolean {
  if (!season) return false
  if (season.zone_matched) return true
  return !season.other_zones_open && isStatewide(season.zone)
}

// An all-duck season's bag limit is the aggregate; a species with its own cap inside it
// (5 mallards, 3 pintails, 1 scaup...) shows that cap, with the aggregate kept alongside.
export function bagLimitFor(season: SeasonRow | null, speciesSlug: string): unknown {
  const bag = decodeJsonbField<Record<string, unknown>>(season?.bag_limit)
  if (!bag) return null
  const limits = bag.speciesLimits as Record<string, number> | undefined
  const own = limits?.[speciesSlug]
  if (typeof own !== 'number') return bag
  return { ...bag, daily: own, aggregateDaily: bag.daily }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const huntRoutes: FastifyPluginAsync = async (app) => {
  app.get('/recommendations', {
    schema: {
      tags: ['hunt'],
      summary: 'Ranked hunting location recommendations',
      querystring: {
        type: 'object',
        properties: {
          species: { type: 'string', description: 'Species slug (e.g. snow-goose, mallard)' },
          states: { type: 'string', description: 'Comma-separated state codes. Defaults to all V1 states.' },
          date: { type: 'string', description: 'Target date YYYY-MM-DD. Defaults to today.' },
          limit: { type: 'integer', default: 10, description: 'Max results' },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as {
      species?: string
      states?: string
      date?: string
      limit?: number
    }
    const db = getDb()

    // ── Parse params ────────────────────────────────────────────────────────
    const targetDate = query.date ? new Date(query.date) : new Date()
    const targetDateStr = targetDate.toISOString().split('T')[0]
    const targetYear = targetDate.getFullYear()

    const stateCodes = query.states
      ? query.states.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 2)
      : V1_STATES

    if (query.states && stateCodes.length === 0) {
      return reply.status(400).send({ error: true, message: 'states parameter must contain at least one valid 2-letter state code' })
    }

    const speciesSlug = query.species || null
    const limit = Math.min(query.limit || 10, 25)

    // ── Step 1: Latest counts per location+species via CTE ──────────────────
    // Filter out MWI annual rows (historical only, not indicative of current activity)
    // Filter to wildlife_refuge type for relevance
    // Drop counts too old to describe current activity (see lib/freshness.ts)
    const speciesFilter = speciesSlug
      ? sql`AND sp.slug = ${speciesSlug}`
      : sql`AND sp.category = 'waterfowl'`

    const countRows = await db.execute(sql`
      WITH ranked AS (
        SELECT
          rc.location_id, rc.species_id, rc.count, rc.survey_date, rc.survey_type,
          l.name AS location_name,
          l.location_type,
          l.center_point,
          l.website_url,
          l.metadata AS location_metadata,
          s.code AS state_code,
          s.id AS state_id,
          sp.slug AS species_slug,
          sp.name AS species_name,
          ROW_NUMBER() OVER (
            PARTITION BY rc.location_id, rc.species_id
            ORDER BY rc.survey_date DESC
          ) AS rn
        FROM refuge_counts rc
        JOIN locations l ON rc.location_id = l.id
        JOIN states s ON l.state_id = s.id
        JOIN species sp ON rc.species_id = sp.id
        WHERE l.location_type = 'wildlife_refuge'
          AND l.name NOT LIKE '% - Statewide MWI'
          AND rc.survey_type != 'mwi_annual'
          AND rc.survey_date >= ${targetDateStr}::date
            - (CASE WHEN rc.survey_type = 'aerial_monthly' THEN ${FRESH_DAYS_MONTHLY}::int ELSE ${FRESH_DAYS}::int END) * INTERVAL '1 day'
          AND s.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})
          ${speciesFilter}
      )
      SELECT
        c.location_id, c.location_name, c.location_type,
        c.state_code, c.state_id,
        c.center_point, c.website_url, c.location_metadata,
        c.species_slug, c.species_name,
        c.count, c.survey_date, c.survey_type,
        p.count AS previous_count
      FROM ranked c
      LEFT JOIN ranked p
        ON c.location_id = p.location_id AND c.species_id = p.species_id AND p.rn = 2
      WHERE c.rn = 1
      ORDER BY c.state_code, c.location_name
    `)

    // center_point can arrive as a double-encoded string; normalize once so every later read sees {lat, lng}
    const rows = (countRows as unknown as CountRow[]).map(r => ({ ...r, center_point: decodePoint(r.center_point) }))

    // Deduplicate: one row per location (pick highest count if multiple species)
    const locationMap = new Map<string, CountRow>()
    for (const row of rows) {
      const existing = locationMap.get(row.location_id)
      if (!existing || (row.count ?? 0) > (existing.count ?? 0)) {
        locationMap.set(row.location_id, row)
      }
    }
    const uniqueRows = [...locationMap.values()]

    // ── Step 2: Query open seasons + fetch push factors in parallel ─────────
    const openSeasonMap = new Map<string, SeasonRow[]>()

    // Build refugesByState map — collect ALL refuge coords per state for multi-point push scoring
    const refugesByState = new Map<string, { lat: number; lng: number }[]>()
    for (const row of uniqueRows) {
      if (row.center_point) {
        if (!refugesByState.has(row.state_code)) refugesByState.set(row.state_code, [])
        refugesByState.get(row.state_code)!.push(row.center_point)
      }
    }

    const [, pushResult] = await Promise.all([
      // Season query
      (async () => {
        if (uniqueRows.length === 0) return
        const seasonRows = await db.execute(sql`
          SELECT
            s.code AS state_code,
            sp.slug AS species_slug,
            se.name AS season_name,
            se.start_date,
            se.end_date,
            se.bag_limit,
            se.metadata->>'appliesTo' AS applies_to,
            se.units->>0 AS zone
          FROM seasons se
          JOIN states s ON se.state_id = s.id
          JOIN species sp ON se.species_id = sp.id
          WHERE s.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})
            AND se.year = ${targetYear}
            AND se.start_date <= ${targetDateStr}::date
            AND se.end_date >= ${targetDateStr}::date
            -- Falconry-only segments (e.g. LA Nov 5-13, TX Feb 1-21) aren't open to gun hunters
            AND se.season_type IS DISTINCT FROM 'falconry'
            ${speciesSlug ? sql`AND (sp.slug = ${speciesSlug} OR se.metadata->>'appliesTo' = 'ducks')` : sql`AND sp.category = 'waterfowl'`}
        `)
        for (const sr of seasonRows as unknown as SeasonRow[]) {
          const key = `${sr.state_code}:${sr.applies_to === 'ducks' ? ALL_DUCKS_KEY : sr.species_slug}`
          const list = openSeasonMap.get(key)
          if (list) list.push(sr)
          else openSeasonMap.set(key, [sr])
        }
      })(),
      // Push factors for all relevant states
      getPushFactorsForStates(stateCodes, refugesByState),
    ])

    // Push factor for a location: its sub-state region's (e.g. Texas Panhandle) if it
    // has one, otherwise its state's.
    const pushFor = (row: CountRow) =>
      pushFactorAt(row.state_code, row.center_point, pushResult.pushFactors, pushResult.regionalPushFactors)

    // ── Step 3: Compute trend + migration status + preliminary score ─────────
    const maxCount = Math.max(...uniqueRows.map(r => r.count ?? 0), 1)

    type ScoredRow = {
      row: CountRow
      trend: string
      delta: number | null
      deltaPercent: number | null
      migrationStatus: ReturnType<typeof getMigrationStatus>
      isAnomaly: boolean
      seasonOpen: boolean
      season: SeasonRow | null
      trendScore: number
      magnitudeScore: number
      seasonScore: number
      weatherScore: number
      pushScore: number
      migrationScore: number
      anomalyBonus: number
      prelimScore: number
    }

    const scored: ScoredRow[] = uniqueRows.map(row => {
      let trend = 'no_data'
      let delta: number | null = null
      let deltaPercent: number | null = null

      if (row.count !== null && row.count !== undefined) {
        if (row.previous_count === null || row.previous_count === undefined) {
          trend = 'new'
        } else {
          delta = row.count - row.previous_count
          deltaPercent = row.previous_count !== 0
            ? Math.round(((row.count - row.previous_count) / row.previous_count) * 1000) / 10
            : null
          const absPct = deltaPercent !== null ? Math.abs(deltaPercent) : null
          if (absPct !== null && absPct < 5) trend = 'stable'
          else if (delta > 0) trend = 'increasing'
          else trend = 'decreasing'
        }
      }

      const migrationStatus = getMigrationStatus(trend, deltaPercent)
      // Spike: ≥30% increase AND count ≥500
      const isAnomaly = !!(deltaPercent !== null && deltaPercent >= 30 && (row.count ?? 0) >= 500)

      const season = findOpenSeason(openSeasonMap, row.state_code, row.species_slug, huntZonesOf(row.location_metadata))
      const seasonOpen = season !== null

      const statePush = pushFor(row)
      const statePushScore = statePush?.pushScore ?? 0

      const trendScore = TREND_SCORES[trend] ?? 0
      const magnitudeScore = row.count !== null ? Math.min(20, Math.round((row.count / maxCount) * 20)) : 0
      const seasonScore = seasonOpen ? 20 : 0
      const pushScore = PUSH_SCORES[statePushScore] ?? 0
      const migrationScore = MIGRATION_STATUS_SCORES[migrationStatus] ?? 0
      const anomalyBonus = isAnomaly ? 5 : 0

      const rawPrelim = trendScore + magnitudeScore + seasonScore + pushScore + migrationScore + anomalyBonus

      return {
        row, trend, delta, deltaPercent, migrationStatus, isAnomaly,
        seasonOpen, season,
        trendScore, magnitudeScore, seasonScore,
        weatherScore: 0, // filled in step 4
        pushScore, migrationScore, anomalyBonus,
        prelimScore: rawPrelim,
      }
    })

    // Sort by prelim score, then fetch weather for everyone who could still
    // land in the final top `limit` once a weather bonus is added — not just
    // a fixed top-8. Weather can add at most WEATHER_MAX_BONUS points, so
    // anyone within that margin of the current #`limit` cutoff has a real
    // shot at displacing it; a candidate ranked #9 with "excellent" weather
    // (+15) can legitimately beat a #8 stuck with "poor" (+0). Below that
    // margin a candidate has no way to catch up, so it's safe to skip the
    // (rate-limited, external) weather call and score it 0.
    scored.sort((a, b) => b.prelimScore - a.prelimScore)
    const WEATHER_MAX_BONUS = Math.max(...Object.values(WEATHER_SCORES))
    const guaranteedCount = Math.min(limit, scored.length)
    const cutoffScore = guaranteedCount > 0 ? scored[guaranteedCount - 1].prelimScore : 0
    let weatherPoolSize = scored.findIndex(item => item.prelimScore < cutoffScore - WEATHER_MAX_BONUS)
    if (weatherPoolSize === -1) weatherPoolSize = scored.length
    // Hard cap so a large tie cluster near the cutoff can't trigger unbounded
    // external weather calls in one request.
    const MAX_WEATHER_FETCHES = 40
    weatherPoolSize = Math.max(guaranteedCount, Math.min(weatherPoolSize, MAX_WEATHER_FETCHES))
    const topCandidates = scored.slice(0, weatherPoolSize)
    const rest = scored.slice(weatherPoolSize)

    // ── Step 4: Fetch weather for top candidates ────────────────────────────
    type WeatherResult = {
      rating: 'excellent' | 'good' | 'fair' | 'poor'
      temperature: number
      temperatureUnit: string
      windSpeed: string
      conditions: string
    }
    const weatherResults = await Promise.allSettled(
      topCandidates.map(async (item) => {
        const cp = item.row.center_point
        if (!cp) return null
        const w = await getHuntingConditions(cp.lat, cp.lng, item.row.state_code)
        if (!w) return null
        return { rating: w.huntingRating, temperature: w.temperature, temperatureUnit: w.temperatureUnit, windSpeed: w.windSpeed, conditions: w.conditions } as WeatherResult
      })
    )

    for (let i = 0; i < topCandidates.length; i++) {
      const result = weatherResults[i]
      if (result.status === 'fulfilled' && result.value) {
        topCandidates[i].weatherScore = WEATHER_SCORES[result.value.rating] ?? 0
      }
    }

    // ── Step 5: Final sort + shape response ─────────────────────────────────
    const allScored = [...topCandidates, ...rest]
    allScored.sort((a, b) => {
      const scoreA = Math.min(100, a.trendScore + a.magnitudeScore + a.seasonScore + a.weatherScore + a.pushScore + a.migrationScore + a.anomalyBonus)
      const scoreB = Math.min(100, b.trendScore + b.magnitudeScore + b.seasonScore + b.weatherScore + b.pushScore + b.migrationScore + b.anomalyBonus)
      return scoreB - scoreA
    })

    const recommendations = allScored.slice(0, limit).map((item, i) => {
      const rawScore = item.trendScore + item.magnitudeScore + item.seasonScore + item.weatherScore + item.pushScore + item.migrationScore + item.anomalyBonus
      const score = Math.min(100, rawScore)
      const cp = item.row.center_point
      const meta = decodeJsonbField(item.row.location_metadata)

      const candidateIdx = topCandidates.indexOf(item)
      const weatherVal = candidateIdx >= 0 && weatherResults[candidateIdx]?.status === 'fulfilled'
        ? weatherResults[candidateIdx].value as WeatherResult | null
        : null

      const statePush = pushFor(item.row)

      return {
        rank: i + 1,
        score,
        locationId: item.row.location_id,
        locationName: item.row.location_name,
        locationType: item.row.location_type,
        state: item.row.state_code,
        flyway: (meta as Record<string, unknown> | null)?.flyway as string | null ?? null,
        huntZones: huntZonesOf(meta),
        centerPoint: cp,
        websiteUrl: item.row.website_url,
        species: item.row.species_slug,
        speciesName: item.row.species_name,
        latestCount: item.row.count ?? null,
        surveyDate: item.row.survey_date ?? null,
        trend: item.trend,
        delta: item.delta,
        deltaPercent: item.deltaPercent,
        migrationStatus: item.migrationStatus,
        isAnomaly: item.isAnomaly,
        pushScore: statePush?.pushScore ?? 0,
        coldFrontPresent: statePush?.coldFrontPresent ?? false,
        coldFrontIncoming: statePush?.coldFrontIncoming ?? false,
        seasonOpen: item.seasonOpen,
        // Zoned seasons: name the zone (or say several are open) instead of showing one zone's
        // dates on a location that may be in another zone. See seasonDisplayName.
        seasonName: seasonDisplayName(item.season),
        seasonStart: seasonDatesApply(item.season) ? item.season!.start_date : null,
        seasonEnd: seasonDatesApply(item.season) ? item.season!.end_date : null,
        bagLimit: bagLimitFor(item.season, item.row.species_slug),
        weatherRating: weatherVal?.rating ?? null,
        temperature: weatherVal?.temperature ?? null,
        temperatureUnit: weatherVal?.temperatureUnit ?? null,
        windSpeed: weatherVal?.windSpeed ?? null,
        conditions: weatherVal?.conditions ?? null,
        scoreBreakdown: {
          trendScore: item.trendScore,
          magnitudeScore: item.magnitudeScore,
          seasonScore: item.seasonScore,
          weatherScore: item.weatherScore,
          pushScore: item.pushScore,
          migrationScore: item.migrationScore,
          anomalyBonus: item.anomalyBonus,
        },
      }
    })

    return {
      recommendations,
      queryParams: { species: speciesSlug, states: stateCodes, date: targetDateStr },
      totalLocations: allScored.length,
    }
  })
}
