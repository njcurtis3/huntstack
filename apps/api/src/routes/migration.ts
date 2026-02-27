import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { getPushFactorsForStates } from '../lib/weather.js'
import { generateChatResponse, isConfigured } from '../lib/together.js'

const V1_STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO']

// Approximate state centroids (latitude) for N→S ordering
// Used when a location doesn't have a precise center_point
const STATE_LATITUDES: Record<string, number> = {
  MO: 38.5,
  KS: 38.7,
  OK: 35.5,
  AR: 34.8,
  TX: 31.5,
  NM: 34.5,
  LA: 30.9,
  ND: 47.5,
  SD: 44.3,
  NE: 41.5,
  IA: 42.0,
  MN: 46.4,
  WI: 44.8,
  IL: 40.6,
  MS: 32.3,
}

// ─── Weekly summary cache (6h TTL) ───────────────────────────────────────────

interface SummaryCache {
  summary: string
  generatedAt: string
  expiresAt: number
}

const summaryCache = new Map<string, SummaryCache>()
const SUMMARY_TTL = 6 * 60 * 60 * 1000  // 6 hours

function getCachedSummary(key: string): SummaryCache | null {
  const entry = summaryCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    summaryCache.delete(key)
    return null
  }
  return entry
}

export const migrationRoutes: FastifyPluginAsync = async (app) => {
  // Push factors: weather signals that indicate birds are likely moving
  app.get('/push-factors', {
    schema: {
      tags: ['migration'],
      summary: 'Weather push factors indicating bird movement potential per state',
      querystring: {
        type: 'object',
        properties: {
          states: {
            type: 'string',
            description: 'Comma-separated state codes. Defaults to all V1 states.',
          },
        },
      },
    },
  }, async (request) => {
    const { states: statesParam } = request.query as { states?: string }

    const stateCodes = statesParam
      ? statesParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 2)
      : V1_STATES

    const db = getDb()
    const stateList = stateCodes.map(s => `'${s}'`).join(', ')

    // Get one representative refuge centerPoint per state
    const refugeRows = await db.execute(sql`
      SELECT DISTINCT ON (s.code)
        s.code AS state_code,
        l.center_point
      FROM locations l
      JOIN states s ON l.state_id = s.id
      WHERE l.location_type = 'wildlife_refuge'
        AND l.center_point IS NOT NULL
        AND l.name NOT LIKE '% - Statewide MWI'
        AND s.code IN (${sql.raw(stateList)})
      ORDER BY s.code, l.name
    `)

    const refugeByState = new Map<string, { lat: number; lng: number }>()
    for (const row of refugeRows as unknown as Array<{ state_code: string; center_point: unknown }>) {
      const cp = row.center_point as { lat: number; lng: number } | null
      if (cp) refugeByState.set(row.state_code, cp)
    }

    const { pushFactors, overallPushScore } = await getPushFactorsForStates(stateCodes, refugeByState)

    return {
      pushFactors,
      overallPushScore,
      fetchedAt: new Date().toISOString(),
    }
  })

  // Weekly Migration Summary — LLM-generated narrative, cached 6h
  app.get('/weekly-summary', {
    schema: {
      tags: ['migration'],
      summary: 'LLM-generated weekly migration intelligence summary',
      querystring: {
        type: 'object',
        properties: {
          flyway: { type: 'string', description: 'Filter by flyway (central, mississippi, etc.)' },
          species: { type: 'string', description: 'Filter by species slug' },
          refresh: { type: 'boolean', description: 'Force regenerate (bypass cache)' },
        },
      },
    },
  }, async (request, reply) => {
    const { flyway, species, refresh } = request.query as {
      flyway?: string
      species?: string
      refresh?: boolean
    }

    const cacheKey = `summary:${flyway || 'all'}:${species || 'all'}`

    // Return cached summary if fresh and not forced refresh
    if (!refresh) {
      const cached = getCachedSummary(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }
    }

    if (!isConfigured()) {
      return reply.status(503).send({
        error: true,
        message: 'AI service not configured.',
      })
    }

    const db = getDb()

    // Fetch the last 7 days of count data for context
    const flywayFilter = flyway ? sql`AND l.metadata->>'flyway' ILIKE ${flyway}` : sql``
    const speciesFilter = species ? sql`AND sp.slug = ${species}` : sql``

    const recentCounts = await db.execute(sql`
      WITH ranked AS (
        SELECT
          l.name AS refuge_name,
          s.code AS state_code,
          l.metadata->>'flyway' AS flyway,
          sp.name AS species_name,
          rc.count,
          rc.survey_date,
          LAG(rc.count) OVER (PARTITION BY rc.location_id, rc.species_id ORDER BY rc.survey_date) AS prev_count,
          ROW_NUMBER() OVER (PARTITION BY rc.location_id, rc.species_id ORDER BY rc.survey_date DESC) AS rn
        FROM refuge_counts rc
        JOIN locations l ON rc.location_id = l.id
        JOIN states s ON l.state_id = s.id
        JOIN species sp ON rc.species_id = sp.id
        WHERE l.name NOT LIKE '% - Statewide MWI'
          AND rc.survey_date >= NOW() - INTERVAL '30 days'
          ${flywayFilter}
          ${speciesFilter}
      )
      SELECT *
      FROM ranked
      WHERE rn = 1
      ORDER BY count DESC
      LIMIT 25
    `)

    type CountRow = {
      refuge_name: string
      state_code: string
      flyway: string | null
      species_name: string
      count: number
      survey_date: string
      prev_count: number | null
    }

    const rows = recentCounts as unknown as CountRow[]

    if (rows.length === 0) {
      return {
        summary: 'No recent survey data available for this period. Check back after the next refuge surveys are processed.',
        generatedAt: new Date().toISOString(),
        cached: false,
      }
    }

    // Build structured data for the LLM prompt
    const totalBirds = rows.reduce((s, r) => s + Number(r.count), 0)
    const refugeLines = rows.map(r => {
      const delta = r.prev_count !== null ? Number(r.count) - Number(r.prev_count) : null
      const pct = delta !== null && r.prev_count ? ((delta / Number(r.prev_count)) * 100).toFixed(0) : null
      const trend = delta === null ? 'first survey' : delta > 0 ? `+${delta.toLocaleString()} (${pct}%)` : delta < 0 ? `${delta.toLocaleString()} (${pct}%)` : 'stable'
      const surveyDate = new Date(r.survey_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return `- ${r.refuge_name} (${r.state_code}${r.flyway ? ', ' + r.flyway + ' flyway' : ''}): ${Number(r.count).toLocaleString()} ${r.species_name} as of ${surveyDate} [${trend}]`
    }).join('\n')

    // Also fetch push factors for weather context
    const statesInData = [...new Set(rows.map(r => r.state_code))]
    const stateList = statesInData.map(s => `'${s}'`).join(', ')
    let weatherContext = ''

    if (statesInData.length > 0) {
      try {
        const refugePoints = await db.execute(sql`
          SELECT DISTINCT ON (s.code)
            s.code AS state_code, l.center_point
          FROM locations l
          JOIN states s ON l.state_id = s.id
          WHERE l.location_type = 'wildlife_refuge'
            AND l.center_point IS NOT NULL
            AND l.name NOT LIKE '% - Statewide MWI'
            AND s.code IN (${sql.raw(stateList)})
          ORDER BY s.code, l.name
        `)

        const refugeByState = new Map<string, { lat: number; lng: number }>()
        for (const row of refugePoints as unknown as Array<{ state_code: string; center_point: unknown }>) {
          const cp = row.center_point as { lat: number; lng: number } | null
          if (cp) refugeByState.set(row.state_code, cp)
        }

        const { pushFactors } = await getPushFactorsForStates(statesInData, refugeByState)
        const weatherLines = pushFactors.map(pf => {
          const signals = [
            pf.coldFrontPresent && 'cold front present',
            pf.coldFrontIncoming && 'cold front incoming (48h)',
            pf.windIsFromNorth && `north winds (${pf.windDirection})`,
            pf.temperature !== null && pf.temperature < 32 && `sub-freezing (${pf.temperature}°${pf.temperatureUnit})`,
          ].filter(Boolean).join(', ')
          return `- ${pf.stateCode}: push score ${pf.pushScore}/3${signals ? ' | Push signals: ' + signals : ''}`
        })
        if (weatherLines.length > 0) {
          weatherContext = `\n\nCurrent weather/push conditions:\n${weatherLines.join('\n')}`
        }
      } catch {
        // Weather context is optional — proceed without it
      }
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const systemPrompt = `You are a waterfowl migration analyst writing the weekly intelligence report for HuntStack, a hunting intelligence platform. Write in plain prose — no markdown, no bold text, no bullet points, no headers. Write in a direct, informative style for duck and goose hunters. Be specific about locations, numbers, and trends. Do not be generic.`

    const userPrompt = `Today is ${today}. Write a 2-3 paragraph weekly migration intelligence summary for waterfowl hunters${flyway ? ' focused on the ' + flyway + ' flyway' : ''}${species ? ' for ' + species.replace(/-/g, ' ') : ''}.

Use this survey data:
${refugeLines}
Total birds counted across all reporting locations: ${totalBirds.toLocaleString()}
${weatherContext}

Cover:
1. Where the highest concentrations are right now and whether numbers are building or declining
2. Any notable spikes or drops at specific refuges hunters should know about
3. What the weather/push factors mean for movement over the next few days and where hunters should focus

Keep it under 150 words. Be direct and actionable.`

    const summary = await generateChatResponse(userPrompt, systemPrompt)

    const result: SummaryCache = {
      summary: summary.trim(),
      generatedAt: new Date().toISOString(),
      expiresAt: Date.now() + SUMMARY_TTL,
    }

    summaryCache.set(cacheKey, result)

    return {
      summary: result.summary,
      generatedAt: result.generatedAt,
      cached: false,
    }
  })

  // Flyway Progression — weekly count time-series grouped by state, ordered N→S
  app.get('/flyway-progression', {
    schema: {
      tags: ['migration'],
      summary: 'Weekly count progression by state, ordered N→S to visualize migration movement',
      querystring: {
        type: 'object',
        properties: {
          species: { type: 'string', description: 'Species slug filter' },
          flyway: { type: 'string', description: 'Flyway filter (central, mississippi, etc.)' },
          year: { type: 'number', description: 'Season year (uses current year if omitted)' },
          seasons: { type: 'number', description: 'Number of recent seasons to include (default 1, max 3)' },
        },
      },
    },
  }, async (request) => {
    const { species, flyway, year, seasons } = request.query as {
      species?: string
      flyway?: string
      year?: number
      seasons?: number
    }

    const db = getDb()

    // Season window: Oct 1 of (year-1) through Mar 31 of year (duck season spans Nov-Jan)
    const currentYear = new Date().getFullYear()
    const seasonYear = year ?? (new Date().getMonth() >= 9 ? currentYear + 1 : currentYear)
    const numSeasons = Math.min(3, Math.max(1, seasons ?? 1))

    const startYear = seasonYear - numSeasons
    const startDate = `${startYear}-09-01`
    const endDate = `${seasonYear}-04-30`

    const speciesFilter = species ? sql`AND sp.slug = ${species}` : sql``
    const flywayFilter = flyway ? sql`AND l.metadata->>'flyway' ILIKE ${flyway}` : sql``

    const rows = await db.execute(sql`
      SELECT
        s.code AS state_code,
        s.name AS state_name,
        DATE_TRUNC('week', rc.survey_date) AS week_start,
        SUM(rc.count) AS total_count,
        COALESCE(
          AVG((l.center_point->>'lat')::numeric),
          NULL
        ) AS avg_lat
      FROM refuge_counts rc
      JOIN locations l ON rc.location_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN species sp ON rc.species_id = sp.id
      WHERE l.name NOT LIKE '% - Statewide MWI'
        AND rc.survey_date BETWEEN ${startDate}::date AND ${endDate}::date
        ${speciesFilter}
        ${flywayFilter}
      GROUP BY s.code, s.name, DATE_TRUNC('week', rc.survey_date)
      ORDER BY s.code, week_start
    `)

    type ProgressionRow = {
      state_code: string
      state_name: string
      week_start: string
      total_count: string | number
      avg_lat: string | number | null
    }

    const rawRows = rows as unknown as ProgressionRow[]

    // Build per-state series
    const stateMap = new Map<string, {
      stateCode: string
      stateName: string
      latitude: number
      weeks: Array<{ weekStart: string; totalCount: number }>
      peakWeek: string | null
      peakCount: number
    }>()

    for (const row of rawRows) {
      const count = Number(row.total_count)
      const lat = row.avg_lat !== null
        ? Number(row.avg_lat)
        : (STATE_LATITUDES[row.state_code] ?? 35)

      if (!stateMap.has(row.state_code)) {
        stateMap.set(row.state_code, {
          stateCode: row.state_code,
          stateName: row.state_name,
          latitude: lat,
          weeks: [],
          peakWeek: null,
          peakCount: 0,
        })
      }

      const entry = stateMap.get(row.state_code)!
      const weekStr = new Date(row.week_start).toISOString().slice(0, 10)
      entry.weeks.push({ weekStart: weekStr, totalCount: count })

      if (count > entry.peakCount) {
        entry.peakCount = count
        entry.peakWeek = weekStr
      }

      // Prefer real lat over hardcoded centroid once we see data
      if (row.avg_lat !== null) {
        entry.latitude = lat
      }
    }

    // Sort states N→S (descending latitude)
    const states = [...stateMap.values()].sort((a, b) => b.latitude - a.latitude)

    // Build a unified week axis (union of all weeks, sorted)
    const allWeeks = [...new Set(rawRows.map(r => new Date(r.week_start).toISOString().slice(0, 10)))].sort()

    return {
      seasonYear,
      seasonWindow: { start: startDate, end: endDate },
      weeks: allWeeks,
      states,
      species: species ?? null,
      flyway: flyway ?? null,
    }
  })
}
