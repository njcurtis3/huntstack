import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { getForecast, getAlerts } from '../lib/weather.js'
import { generateChatResponse, isConfigured } from '../lib/together.js'

const V1_STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO']

// North/northwest winds are the primary waterfowl push signals
const NORTH_DIRECTIONS = new Set(['N', 'NW', 'NNW', 'NNE', 'NE'])

function isNorthWind(dir: string): boolean {
  return NORTH_DIRECTIONS.has(dir.toUpperCase().trim())
}

// Detect cold front in a daily forecast array:
//   "present" = >10°F drop occurs within the first 4 periods (~48h)
//   "incoming" = >10°F drop occurs anywhere in the next 8 periods (~4 days)
function detectColdFront(periods: { temperature: number }[]): {
  coldFrontPresent: boolean
  coldFrontIncoming: boolean
} {
  if (periods.length < 4) return { coldFrontPresent: false, coldFrontIncoming: false }

  // Short-window: first 4 periods (today + tomorrow in day/night pairs)
  const short = periods.slice(0, 4)
  const shortMax = Math.max(...short.slice(0, 2).map(p => p.temperature))
  const shortMin = Math.min(...short.slice(2).map(p => p.temperature))
  const coldFrontPresent = shortMax - shortMin >= 10

  // Longer window: up to 8 periods (~4 days)
  const long = periods.slice(0, Math.min(8, periods.length))
  const longMax = Math.max(...long.slice(0, 4).map(p => p.temperature))
  const longMin = Math.min(...long.slice(4).map(p => p.temperature))
  const coldFrontIncoming = !coldFrontPresent && long.length >= 6 && longMax - longMin >= 10

  return { coldFrontPresent, coldFrontIncoming }
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

    // Get one representative refuge centerPoint per state (alphabetically first)
    const stateList = stateCodes.map(s => `'${s}'`).join(', ')
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

    // Fetch forecast + alerts for all states in parallel
    const results = await Promise.allSettled(
      stateCodes.map(async (stateCode) => {
        const cp = refugeByState.get(stateCode)

        const [forecast, alerts] = await Promise.all([
          cp ? getForecast(cp.lat, cp.lng) : Promise.resolve(null),
          getAlerts(stateCode),
        ])

        if (!forecast || forecast.length === 0) {
          // No forecast available — still return alert info
          return {
            stateCode,
            pushScore: 0,
            coldFrontPresent: false,
            coldFrontIncoming: false,
            windDirection: null as string | null,
            windIsFromNorth: false,
            temperature: null as number | null,
            temperatureUnit: null as string | null,
            activeAlerts: alerts
              .filter(a => ['Extreme', 'Severe', 'Moderate'].includes(a.severity))
              .slice(0, 3)
              .map(a => ({ event: a.event, severity: a.severity, headline: a.headline })),
          }
        }

        // Use first daytime period as "current" conditions
        const current = forecast.find(p => p.isDaytime) ?? forecast[0]
        const { coldFrontPresent, coldFrontIncoming } = detectColdFront(forecast)
        const windDir = current.windDirection
        const northWind = isNorthWind(windDir)
        const subFreezing = current.temperature < 32

        // Push score: 0–3 (each factor adds 1)
        const pushScore = (coldFrontPresent ? 1 : 0) + (northWind ? 1 : 0) + (subFreezing ? 1 : 0)

        const migrationAlerts = alerts
          .filter(a => ['Extreme', 'Severe', 'Moderate'].includes(a.severity))
          .slice(0, 3)
          .map(a => ({ event: a.event, severity: a.severity, headline: a.headline }))

        return {
          stateCode,
          pushScore,
          coldFrontPresent,
          coldFrontIncoming,
          windDirection: windDir,
          windIsFromNorth: northWind,
          temperature: current.temperature,
          temperatureUnit: current.temperatureUnit,
          activeAlerts: migrationAlerts,
        }
      })
    )

    const pushFactors = results
      .filter((r): r is PromiseFulfilledResult<typeof results[0] extends PromiseFulfilledResult<infer T> ? T : never> =>
        r.status === 'fulfilled'
      )
      .map(r => r.value)

    const overallPushScore = pushFactors.length > 0
      ? Math.max(...pushFactors.map(f => f.pushScore))
      : 0

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

        const weatherLines: string[] = []
        for (const row of refugePoints as unknown as Array<{ state_code: string; center_point: unknown }>) {
          const cp = row.center_point as { lat: number; lng: number } | null
          if (!cp) continue
          const forecast = await getForecast(cp.lat, cp.lng)
          if (!forecast || forecast.length === 0) continue
          const current = forecast.find(p => p.isDaytime) ?? forecast[0]
          const { coldFrontPresent, coldFrontIncoming } = detectColdFront(forecast)
          const pushSignals = [
            coldFrontPresent && 'cold front present',
            coldFrontIncoming && 'cold front incoming (48h)',
            isNorthWind(current.windDirection) && `north winds (${current.windDirection})`,
            current.temperature < 32 && `sub-freezing (${current.temperature}°${current.temperatureUnit})`,
          ].filter(Boolean).join(', ')
          weatherLines.push(`- ${row.state_code}: ${current.temperature}°${current.temperatureUnit}, ${current.windSpeed} ${current.windDirection}${pushSignals ? ' | Push signals: ' + pushSignals : ''}`)
        }
        if (weatherLines.length > 0) {
          weatherContext = `\n\nCurrent weather conditions:\n${weatherLines.join('\n')}`
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
}
