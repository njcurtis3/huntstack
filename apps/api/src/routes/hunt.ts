import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { getHuntingConditions, getPushFactorsForStates } from '../lib/weather.js'

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

// pushScore 0–3 → migration pressure score 0–10
const PUSH_SCORES: Record<number, number> = { 0: 0, 1: 4, 2: 7, 3: 10 }

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

function getMigrationStatus(
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

interface SeasonRow {
  state_code: string
  species_slug: string
  season_name: string
  start_date: string
  end_date: string
  bag_limit: unknown
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
  }, async (request) => {
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

    const speciesSlug = query.species || null
    const limit = Math.min(query.limit || 10, 25)

    // ── Step 1: Latest counts per location+species via CTE ──────────────────
    // Filter out MWI annual rows (historical only, not indicative of current activity)
    // Filter to wildlife_refuge type for relevance
    const stateList = stateCodes.map(s => `'${s}'`).join(', ')
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
          AND s.code IN (${sql.raw(stateList)})
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

    const rows = countRows as unknown as CountRow[]

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
    const openSeasonMap = new Map<string, SeasonRow>()

    // Build refugeByState map for push factor fetches (one point per state)
    const refugeByState = new Map<string, { lat: number; lng: number }>()
    for (const row of uniqueRows) {
      if (row.center_point && !refugeByState.has(row.state_code)) {
        refugeByState.set(row.state_code, row.center_point)
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
            se.bag_limit
          FROM seasons se
          JOIN states s ON se.state_id = s.id
          JOIN species sp ON se.species_id = sp.id
          WHERE s.code IN (${sql.raw(stateList)})
            AND se.year = ${targetYear}
            AND se.start_date <= ${targetDateStr}::date
            AND se.end_date >= ${targetDateStr}::date
            ${speciesSlug ? sql`AND sp.slug = ${speciesSlug}` : sql`AND sp.category = 'waterfowl'`}
        `)
        for (const sr of seasonRows as unknown as SeasonRow[]) {
          const key = `${sr.state_code}:${sr.species_slug}`
          if (!openSeasonMap.has(key)) openSeasonMap.set(key, sr)
        }
      })(),
      // Push factors for all relevant states
      getPushFactorsForStates(stateCodes, refugeByState),
    ])

    // Build per-state push factor lookup
    const pushByState = new Map<string, { pushScore: number; coldFrontPresent: boolean; coldFrontIncoming: boolean }>()
    for (const pf of pushResult.pushFactors) {
      pushByState.set(pf.stateCode, { pushScore: pf.pushScore, coldFrontPresent: pf.coldFrontPresent, coldFrontIncoming: pf.coldFrontIncoming })
    }

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

      const seasonKey = `${row.state_code}:${row.species_slug}`
      const season = openSeasonMap.get(seasonKey) ?? null
      const seasonOpen = season !== null

      const statePush = pushByState.get(row.state_code)
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

    // Sort by prelim score, take top candidates for weather fetch
    scored.sort((a, b) => b.prelimScore - a.prelimScore)
    const topCandidates = scored.slice(0, 8)
    const rest = scored.slice(8)

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
      const meta = item.row.location_metadata

      const candidateIdx = topCandidates.indexOf(item)
      const weatherVal = candidateIdx >= 0 && weatherResults[candidateIdx]?.status === 'fulfilled'
        ? weatherResults[candidateIdx].value as WeatherResult | null
        : null

      const statePush = pushByState.get(item.row.state_code)

      return {
        rank: i + 1,
        score,
        locationId: item.row.location_id,
        locationName: item.row.location_name,
        locationType: item.row.location_type,
        state: item.row.state_code,
        flyway: (meta as Record<string, unknown> | null)?.flyway as string | null ?? null,
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
        seasonName: item.season?.season_name ?? null,
        seasonStart: item.season?.start_date ?? null,
        seasonEnd: item.season?.end_date ?? null,
        bagLimit: item.season?.bag_limit ?? null,
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
