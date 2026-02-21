import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { getForecast, getAlerts } from '../lib/weather.js'

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
}
