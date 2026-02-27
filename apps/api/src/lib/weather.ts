// ─── NOAA Weather API integration ─────────────────────────────────────────────
// Free API, no key required. Two-step flow:
//   1. /points/{lat},{lng} → resolves grid coordinates (wfo/x/y)
//   2. /gridpoints/{wfo}/{x},{y}/forecast/hourly → hourly forecast
// User-Agent header required by NOAA.

const NOAA_BASE = 'https://api.weather.gov'
const USER_AGENT = '(HuntStack, huntstack.app)'

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number // 0 = permanent
}

const gridPointCache = new Map<string, CacheEntry<GridPoint>>()
const forecastCache = new Map<string, CacheEntry<ForecastPeriod[]>>()
const alertsCache = new Map<string, CacheEntry<WeatherAlert[]>>()

const FORECAST_TTL = 2 * 60 * 60 * 1000  // 2 hours
const ALERTS_TTL = 30 * 60 * 1000         // 30 minutes

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number): void {
  cache.set(key, {
    data,
    expiresAt: ttlMs === 0 ? 0 : Date.now() + ttlMs,
  })
}

// ─── NOAA response types ──────────────────────────────────────────────────────

interface NOAAPointsResponse {
  properties: {
    gridId: string
    gridX: number
    gridY: number
    forecast: string
    forecastHourly: string
    relativeLocation: {
      properties: { city: string; state: string }
    }
    timeZone: string
  }
}

interface NOAAForecastPeriod {
  number: number
  name: string
  startTime: string
  endTime: string
  isDaytime: boolean
  temperature: number
  temperatureUnit: string
  temperatureTrend: string | null
  probabilityOfPrecipitation: { unitCode: string; value: number | null }
  dewpoint: { unitCode: string; value: number }
  relativeHumidity: { unitCode: string; value: number }
  windSpeed: string
  windDirection: string
  icon: string
  shortForecast: string
  detailedForecast: string
}

interface NOAAForecastResponse {
  properties: {
    updated: string
    generatedAt: string
    periods: NOAAForecastPeriod[]
  }
}

interface NOAAAlertFeature {
  properties: {
    id: string
    event: string
    headline: string | null
    description: string
    instruction: string | null
    severity: string
    urgency: string
    certainty: string
    effective: string
    expires: string
    onset: string | null
    ends: string | null
    areaDesc: string
    senderName: string
    status: string
  }
}

interface NOAAAlertsResponse {
  features: NOAAAlertFeature[]
}

// ─── Exported types ───────────────────────────────────────────────────────────

export interface GridPoint {
  wfo: string
  x: number
  y: number
  city: string
  state: string
  timeZone: string
}

export interface ForecastPeriod {
  name: string
  startTime: string
  endTime: string
  isDaytime: boolean
  temperature: number
  temperatureUnit: string
  windSpeed: string
  windDirection: string
  shortForecast: string
  detailedForecast: string
  precipitationChance: number | null
  humidity: number
  dewpoint: number
}

export interface WeatherAlert {
  id: string
  event: string
  headline: string | null
  description: string
  severity: string
  urgency: string
  effective: string
  expires: string
  areaDesc: string
  senderName: string
}

export interface HuntingConditions {
  temperature: number
  temperatureUnit: string
  windSpeed: string
  windDirection: string
  windCategory: 'calm' | 'light' | 'moderate' | 'strong' | 'dangerous'
  precipitationChance: number | null
  humidity: number
  conditions: string
  huntingRating: 'excellent' | 'good' | 'fair' | 'poor'
  huntingNotes: string[]
  forecast: ForecastPeriod[]
  alerts: WeatherAlert[]
}

// ─── NOAA fetch wrapper ───────────────────────────────────────────────────────

async function noaaFetch<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/geo+json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`NOAA API ${response.status}: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Exported methods ─────────────────────────────────────────────────────────

export async function getGridPoint(lat: number, lng: number): Promise<GridPoint | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  const cached = getCached(gridPointCache, key)
  if (cached) return cached

  try {
    const data = await noaaFetch<NOAAPointsResponse>(`${NOAA_BASE}/points/${lat},${lng}`)
    const gp: GridPoint = {
      wfo: data.properties.gridId,
      x: data.properties.gridX,
      y: data.properties.gridY,
      city: data.properties.relativeLocation.properties.city,
      state: data.properties.relativeLocation.properties.state,
      timeZone: data.properties.timeZone,
    }
    setCache(gridPointCache, key, gp, 0) // permanent
    return gp
  } catch (err) {
    console.error('NOAA getGridPoint error:', err)
    return null
  }
}

export async function getForecast(lat: number, lng: number): Promise<ForecastPeriod[] | null> {
  const gp = await getGridPoint(lat, lng)
  if (!gp) return null

  const key = `forecast:${gp.wfo}/${gp.x},${gp.y}`
  const cached = getCached(forecastCache, key)
  if (cached) return cached

  try {
    const data = await noaaFetch<NOAAForecastResponse>(
      `${NOAA_BASE}/gridpoints/${gp.wfo}/${gp.x},${gp.y}/forecast`
    )
    const periods = mapPeriods(data.properties.periods)
    setCache(forecastCache, key, periods, FORECAST_TTL)
    return periods
  } catch (err) {
    console.error('NOAA getForecast error:', err)
    return null
  }
}

export async function getHourlyForecast(lat: number, lng: number): Promise<ForecastPeriod[] | null> {
  const gp = await getGridPoint(lat, lng)
  if (!gp) return null

  const key = `hourly:${gp.wfo}/${gp.x},${gp.y}`
  const cached = getCached(forecastCache, key)
  if (cached) return cached

  try {
    const data = await noaaFetch<NOAAForecastResponse>(
      `${NOAA_BASE}/gridpoints/${gp.wfo}/${gp.x},${gp.y}/forecast/hourly`
    )
    const periods = mapPeriods(data.properties.periods)
    setCache(forecastCache, key, periods, FORECAST_TTL)
    return periods
  } catch (err) {
    console.error('NOAA getHourlyForecast error:', err)
    return null
  }
}

export async function getAlerts(stateCode: string): Promise<WeatherAlert[]> {
  const key = `alerts:${stateCode.toUpperCase()}`
  const cached = getCached(alertsCache, key)
  if (cached) return cached

  try {
    const data = await noaaFetch<NOAAAlertsResponse>(
      `${NOAA_BASE}/alerts/active/area/${stateCode.toUpperCase()}`
    )
    const alerts: WeatherAlert[] = data.features
      .filter(f => f.properties.status === 'Actual')
      .map(f => ({
        id: f.properties.id,
        event: f.properties.event,
        headline: f.properties.headline,
        description: f.properties.description,
        severity: f.properties.severity,
        urgency: f.properties.urgency,
        effective: f.properties.effective,
        expires: f.properties.expires,
        areaDesc: f.properties.areaDesc,
        senderName: f.properties.senderName,
      }))
    setCache(alertsCache, key, alerts, ALERTS_TTL)
    return alerts
  } catch (err) {
    console.error('NOAA getAlerts error:', err)
    return []
  }
}

export async function getHuntingConditions(
  lat: number,
  lng: number,
  stateCode: string,
): Promise<HuntingConditions | null> {
  const [hourly, alerts] = await Promise.all([
    getHourlyForecast(lat, lng),
    getAlerts(stateCode),
  ])

  if (!hourly || hourly.length === 0) return null

  const current = hourly[0]
  const next12 = hourly.slice(0, 12)
  const windMph = parseWindSpeed(current.windSpeed)
  const windCat = classifyWind(windMph)
  const precip = current.precipitationChance
  const temp = current.temperature

  const rating = computeHuntingRating(windMph, precip, temp)
  const notes = generateHuntingNotes(current, next12, windMph, windCat)

  return {
    temperature: current.temperature,
    temperatureUnit: current.temperatureUnit,
    windSpeed: current.windSpeed,
    windDirection: current.windDirection,
    windCategory: windCat,
    precipitationChance: precip,
    humidity: current.humidity,
    conditions: current.shortForecast,
    huntingRating: rating,
    huntingNotes: notes,
    forecast: next12,
    alerts,
  }
}

// ─── Push factor types + shared helper ───────────────────────────────────────

export interface StatePushFactor {
  stateCode: string
  pushScore: number
  coldFrontPresent: boolean
  coldFrontIncoming: boolean
  windDirection: string | null
  windIsFromNorth: boolean
  temperature: number | null
  temperatureUnit: string | null
  activeAlerts: Array<{ event: string; severity: string; headline: string | null }>
}

const NORTH_DIRECTIONS = new Set(['N', 'NW', 'NNW', 'NNE', 'NE'])

function isNorthWind(dir: string): boolean {
  return NORTH_DIRECTIONS.has(dir.toUpperCase().trim())
}

function detectColdFront(periods: { temperature: number }[]): {
  coldFrontPresent: boolean
  coldFrontIncoming: boolean
} {
  if (periods.length < 4) return { coldFrontPresent: false, coldFrontIncoming: false }
  const short = periods.slice(0, 4)
  const shortMax = Math.max(...short.slice(0, 2).map(p => p.temperature))
  const shortMin = Math.min(...short.slice(2).map(p => p.temperature))
  const coldFrontPresent = shortMax - shortMin >= 10
  const long = periods.slice(0, Math.min(8, periods.length))
  const longMax = Math.max(...long.slice(0, 4).map(p => p.temperature))
  const longMin = Math.min(...long.slice(4).map(p => p.temperature))
  const coldFrontIncoming = !coldFrontPresent && long.length >= 6 && longMax - longMin >= 10
  return { coldFrontPresent, coldFrontIncoming }
}

/**
 * Fetch push factors (cold front, north wind, sub-freezing) for a list of states.
 * Requires a DB-provided map of state → representative refuge center point.
 * Both hunt.ts and migration.ts use this shared helper.
 */
export async function getPushFactorsForStates(
  stateCodes: string[],
  refugeByState: Map<string, { lat: number; lng: number }>,
): Promise<{ pushFactors: StatePushFactor[]; overallPushScore: number }> {
  const results = await Promise.allSettled(
    stateCodes.map(async (stateCode): Promise<StatePushFactor> => {
      const cp = refugeByState.get(stateCode)
      const [forecast, alerts] = await Promise.all([
        cp ? getForecast(cp.lat, cp.lng) : Promise.resolve(null),
        getAlerts(stateCode),
      ])

      const migrationAlerts = alerts
        .filter(a => ['Extreme', 'Severe', 'Moderate'].includes(a.severity))
        .slice(0, 3)
        .map(a => ({ event: a.event, severity: a.severity, headline: a.headline }))

      if (!forecast || forecast.length === 0) {
        return { stateCode, pushScore: 0, coldFrontPresent: false, coldFrontIncoming: false, windDirection: null, windIsFromNorth: false, temperature: null, temperatureUnit: null, activeAlerts: migrationAlerts }
      }

      const current = forecast.find(p => p.isDaytime) ?? forecast[0]
      const { coldFrontPresent, coldFrontIncoming } = detectColdFront(forecast)
      const northWind = isNorthWind(current.windDirection)
      const subFreezing = current.temperature < 32
      const pushScore = (coldFrontPresent ? 1 : 0) + (northWind ? 1 : 0) + (subFreezing ? 1 : 0)

      return { stateCode, pushScore, coldFrontPresent, coldFrontIncoming, windDirection: current.windDirection, windIsFromNorth: northWind, temperature: current.temperature, temperatureUnit: current.temperatureUnit, activeAlerts: migrationAlerts }
    })
  )

  const pushFactors = results
    .filter((r): r is PromiseFulfilledResult<StatePushFactor> => r.status === 'fulfilled')
    .map(r => r.value)

  const overallPushScore = pushFactors.length > 0 ? Math.max(...pushFactors.map(f => f.pushScore)) : 0
  return { pushFactors, overallPushScore }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapPeriods(periods: NOAAForecastPeriod[]): ForecastPeriod[] {
  return periods.map(p => ({
    name: p.name,
    startTime: p.startTime,
    endTime: p.endTime,
    isDaytime: p.isDaytime,
    temperature: p.temperature,
    temperatureUnit: p.temperatureUnit,
    windSpeed: p.windSpeed,
    windDirection: p.windDirection,
    shortForecast: p.shortForecast,
    detailedForecast: p.detailedForecast,
    precipitationChance: p.probabilityOfPrecipitation?.value ?? null,
    humidity: p.relativeHumidity?.value ?? 0,
    dewpoint: p.dewpoint?.value ?? 0,
  }))
}

function parseWindSpeed(windStr: string): number {
  const match = windStr.match(/(\d+)\s*(?:to\s*(\d+))?\s*mph/i)
  if (!match) return 0
  // Use higher value if range given (conservative)
  return match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10)
}

function classifyWind(mph: number): 'calm' | 'light' | 'moderate' | 'strong' | 'dangerous' {
  if (mph <= 5) return 'calm'
  if (mph <= 10) return 'light'
  if (mph <= 20) return 'moderate'
  if (mph <= 30) return 'strong'
  return 'dangerous'
}

function computeHuntingRating(
  windMph: number,
  precip: number | null,
  temp: number,
): 'excellent' | 'good' | 'fair' | 'poor' {
  const precipPct = precip ?? 0

  // Poor: dangerous wind or very high precip
  if (windMph > 30 || precipPct > 80) return 'poor'

  // Excellent: moderate wind, low precip, cold temps (ideal waterfowl conditions)
  if (windMph >= 10 && windMph <= 20 && precipPct < 30 && temp >= 25 && temp <= 50) {
    return 'excellent'
  }

  // Good: light-to-strong wind, moderate precip, reasonable temps
  if (windMph >= 5 && windMph <= 25 && precipPct < 50 && temp >= 20 && temp <= 60) {
    return 'good'
  }

  return 'fair'
}

function generateHuntingNotes(
  current: ForecastPeriod,
  next12: ForecastPeriod[],
  windMph: number,
  windCat: string,
): string[] {
  const notes: string[] = []
  const dir = current.windDirection.toUpperCase()

  // Wind-based notes
  if (windCat === 'dangerous') {
    notes.push('Dangerously high winds — consider postponing your hunt')
  } else if (windCat === 'strong') {
    notes.push('Strong winds — excellent for decoying but dress for wind chill')
  } else if (windCat === 'moderate' && (dir === 'N' || dir === 'NW' || dir === 'NE')) {
    notes.push('North wind — expect increased waterfowl movement')
  } else if (windCat === 'calm') {
    notes.push('Calm winds — decoy spread is critical, birds may be wary')
  }

  // Temperature-based notes
  if (current.temperature < 25) {
    notes.push('Below freezing — check ice conditions on water')
  }

  // Precipitation
  const precip = current.precipitationChance ?? 0
  if (precip > 60) {
    notes.push('High precipitation chance — gear accordingly')
  }

  // Cold front detection: look for >10°F temp drop in next 12 hours
  if (next12.length >= 6) {
    const maxTemp = Math.max(...next12.slice(0, 4).map(p => p.temperature))
    const minTemp = Math.min(...next12.slice(4).map(p => p.temperature))
    if (maxTemp - minTemp >= 10) {
      notes.push('Cold front arriving — prime hunting conditions expected')
    }
  }

  // South wind (birds moving back north or holding)
  if (windCat !== 'calm' && (dir === 'S' || dir === 'SW' || dir === 'SE')) {
    notes.push('South wind — birds may hold position or drift north')
  }

  return notes
}
