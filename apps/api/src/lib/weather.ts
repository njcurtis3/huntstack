// ─── NOAA Weather API integration ─────────────────────────────────────────────
// Free API, no key required. Two-step flow:
//   1. /points/{lat},{lng} → resolves grid coordinates (wfo/x/y)
//   2. /gridpoints/{wfo}/{x},{y}/forecast/hourly → hourly forecast
// User-Agent header required by NOAA.

import { BoundedCache } from './cache.js'

const NOAA_BASE = 'https://api.weather.gov'
const USER_AGENT = '(HuntStack, huntstack.com)'

// ─── Cache ────────────────────────────────────────────────────────────────────

const gridPointCache = new BoundedCache<GridPoint>()
const forecastCache = new BoundedCache<ForecastPeriod[]>()
const alertsCache = new BoundedCache<WeatherAlert[]>()

const FORECAST_TTL = 2 * 60 * 60 * 1000  // 2 hours
const ALERTS_TTL = 30 * 60 * 1000         // 30 minutes

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
  const cached = gridPointCache.get(key)
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
    gridPointCache.set(key, gp, 0) // permanent
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
  const cached = forecastCache.get(key)
  if (cached) return cached

  try {
    const data = await noaaFetch<NOAAForecastResponse>(
      `${NOAA_BASE}/gridpoints/${gp.wfo}/${gp.x},${gp.y}/forecast`
    )
    const periods = mapPeriods(data.properties.periods)
    forecastCache.set(key, periods, FORECAST_TTL)
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
  const cached = forecastCache.get(key)
  if (cached) return cached

  try {
    const data = await noaaFetch<NOAAForecastResponse>(
      `${NOAA_BASE}/gridpoints/${gp.wfo}/${gp.x},${gp.y}/forecast/hourly`
    )
    const periods = mapPeriods(data.properties.periods)
    forecastCache.set(key, periods, FORECAST_TTL)
    return periods
  } catch (err) {
    console.error('NOAA getHourlyForecast error:', err)
    return null
  }
}

export async function getAlerts(stateCode: string): Promise<WeatherAlert[]> {
  const key = `alerts:${stateCode.toUpperCase()}`
  const cached = alertsCache.get(key)
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
    alertsCache.set(key, alerts, ALERTS_TTL)
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
  /** Set on a sub-state region's factor (see PUSH_REGIONS); absent on a statewide one. */
  regionId?: string
  regionName?: string
  pushScore: number
  coldFrontPresent: boolean
  coldFrontIncoming: boolean
  windDirection: string | null
  windIsFromNorth: boolean
  temperature: number | null
  temperatureUnit: string | null
  activeAlerts: Array<{ event: string; severity: string; headline: string | null }>
  refugesSampled: number
}

const NORTH_DIRECTIONS = new Set(['N', 'NW', 'NNW', 'NNE', 'NE'])

export function isNorthWind(dir: string): boolean {
  return NORTH_DIRECTIONS.has(dir.toUpperCase().trim())
}

// True if the window contains a >=10°F peak-to-trough drop where the peak's
// actual startTime precedes the trough's (a genuine drop, not a recovery).
// Compares real timestamps rather than array position, so this is correct
// even if a caller ever passes periods out of chronological order — unlike
// comparing findIndex() results, which only happens to work today because
// NOAA's real API responses are already time-ordered.
function hasGenuineDrop(window: { temperature: number; startTime: string }[]): boolean {
  if (window.length < 2) return false

  const maxTemp = Math.max(...window.map(p => p.temperature))
  const minTemp = Math.min(...window.map(p => p.temperature))
  if (maxTemp - minTemp < 10) return false

  const maxPeriod = window.find(p => p.temperature === maxTemp)!
  const minPeriod = window.find(p => p.temperature === minTemp)!
  return new Date(maxPeriod.startTime).getTime() < new Date(minPeriod.startTime).getTime()
}

export function detectColdFront(periods: { temperature: number; startTime: string }[]): {
  coldFrontPresent: boolean
  coldFrontIncoming: boolean
} {
  if (periods.length < 2) return { coldFrontPresent: false, coldFrontIncoming: false }

  const now = Date.now()

  // Bucket periods by how far their startTime is from now
  const within24h  = periods.filter(p => new Date(p.startTime).getTime() - now <= 24 * 60 * 60 * 1000)
  const within48h  = periods.filter(p => new Date(p.startTime).getTime() - now <= 48 * 60 * 60 * 1000)

  // Present: a genuine drop occurs entirely within the next 24 hours.
  const coldFrontPresent = hasGenuineDrop(within24h)

  // Incoming: a genuine drop is visible in the 24–48h window but not yet present.
  const coldFrontIncoming = !coldFrontPresent && hasGenuineDrop(within48h)

  return { coldFrontPresent, coldFrontIncoming }
}

// ─── Sub-state push regions ──────────────────────────────────────────────────
// A statewide majority vote lets the region with the most refuges decide the
// score. In Texas, 7 of 13 points sit on the Gulf Coast or in East Texas, so a
// front over Amarillo never moved the Texas score. A region here is scored on
// its own points only, alongside (not instead of) the statewide score.

export interface PushRegion {
  id: string
  stateCode: string
  name: string
  /** Inclusive box; an omitted side is unbounded. */
  bounds: { minLat?: number; maxLat?: number; minLng?: number; maxLng?: number }
}

export const PUSH_REGIONS: PushRegion[] = [
  {
    // Approximates TPWD's High Plains Mallard Management Unit (east edge US 183,
    // south edge I-20) — close enough for weather, not for legal zone lookups.
    id: 'TX-HP',
    stateCode: 'TX',
    name: 'Texas Panhandle & South Plains',
    bounds: { minLat: 32.0, maxLng: -99.5 },
  },
]

export function pushRegionFor(stateCode: string, point: { lat: number; lng: number } | null | undefined): PushRegion | null {
  if (!point) return null
  return PUSH_REGIONS.find(r => {
    if (r.stateCode !== stateCode) return false
    const b = r.bounds
    return (b.minLat === undefined || point.lat >= b.minLat)
      && (b.maxLat === undefined || point.lat <= b.maxLat)
      && (b.minLng === undefined || point.lng >= b.minLng)
      && (b.maxLng === undefined || point.lng <= b.maxLng)
  }) ?? null
}

/** Active NWS alerts covering one point (so a region doesn't inherit the whole state's alerts). */
async function getAlertsForPoint(lat: number, lng: number): Promise<WeatherAlert[]> {
  const key = `alerts:pt:${lat.toFixed(2)},${lng.toFixed(2)}`
  const cached = alertsCache.get(key)
  if (cached) return cached
  try {
    const data = await noaaFetch<NOAAAlertsResponse>(`${NOAA_BASE}/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`)
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
    alertsCache.set(key, alerts, ALERTS_TTL)
    return alerts
  } catch (err) {
    console.error('NOAA getAlertsForPoint error:', err)
    return []
  }
}

/**
 * Majority-vote push signals across a set of forecasts. Pure, so it is tested
 * directly; getPushFactorsForStates only does the fetching around it.
 */
export function scorePushForecasts(
  forecasts: (ForecastPeriod[] | null)[],
): Omit<StatePushFactor, 'stateCode' | 'regionId' | 'regionName' | 'activeAlerts'> {
  // Filter to forecasts that returned data
  const validForecasts = forecasts.filter((f): f is ForecastPeriod[] => f !== null && f.length > 0)

  if (validForecasts.length === 0) {
    return { pushScore: 0, coldFrontPresent: false, coldFrontIncoming: false, windDirection: null, windIsFromNorth: false, temperature: null, temperatureUnit: null, refugesSampled: 0 }
  }

  // Majority-vote each binary signal across all sampled refuges
  let coldFrontPresentCount = 0
  let coldFrontIncomingCount = 0
  let northWindCount = 0
  let subFreezingCount = 0
  let tempSum = 0
  let representativeWindDir: string | null = null
  let representativeTempUnit: string | null = null

  for (const forecast of validForecasts) {
    const current = forecast.find(p => p.isDaytime) ?? forecast[0]
    const { coldFrontPresent, coldFrontIncoming } = detectColdFront(forecast)
    if (coldFrontPresent) coldFrontPresentCount++
    if (coldFrontIncoming) coldFrontIncomingCount++
    if (isNorthWind(current.windDirection)) northWindCount++
    if (current.temperature < 32) subFreezingCount++
    tempSum += current.temperature
    // Use the first valid forecast's wind/unit as representative display values
    if (!representativeWindDir) representativeWindDir = current.windDirection
    if (!representativeTempUnit) representativeTempUnit = current.temperatureUnit
  }

  const n = validForecasts.length
  const majority = n / 2  // >50% of refuges must show signal for it to count

  const coldFrontPresent = coldFrontPresentCount > majority
  const coldFrontIncoming = !coldFrontPresent && coldFrontIncomingCount > majority
  const northWind = northWindCount > majority
  const subFreezing = subFreezingCount > majority
  const avgTemp = Math.round(tempSum / n)

  // coldFrontIncoming contributes 0.5 — real signal for hunters planning 48h out,
  // but weighted less than a front that is currently present (1.0)
  const pushScore = (coldFrontPresent ? 1 : 0) + (coldFrontIncoming ? 0.5 : 0) + (northWind ? 1 : 0) + (subFreezing ? 1 : 0)

  return {
    pushScore,
    coldFrontPresent,
    coldFrontIncoming,
    windDirection: representativeWindDir,
    windIsFromNorth: northWind,
    temperature: avgTemp,
    temperatureUnit: representativeTempUnit,
    refugesSampled: n,
  }
}

function migrationAlertsFrom(alerts: WeatherAlert[]): StatePushFactor['activeAlerts'] {
  return alerts
    .filter(a => ['Extreme', 'Severe', 'Moderate'].includes(a.severity))
    .slice(0, 3)
    .map(a => ({ event: a.event, severity: a.severity, headline: a.headline }))
}

/**
 * Fetch push factors (cold front, north wind, sub-freezing) for a list of states.
 * Accepts a map of state → ALL known refuge center points (not just one).
 * Signals are majority-voted across all refuge forecasts for the state, producing
 * a more geographically representative push score than a single-point query.
 * Also scores each PUSH_REGIONS region with at least one point, from its own
 * points and its own alerts (regionalPushFactors). Both hunt.ts and migration.ts
 * use this shared helper.
 */
export async function getPushFactorsForStates(
  stateCodes: string[],
  refugesByState: Map<string, { lat: number; lng: number }[]>,
): Promise<{ pushFactors: StatePushFactor[]; regionalPushFactors: StatePushFactor[]; highPushStates: string[] }> {
  const stateResults = await Promise.allSettled(
    stateCodes.map(async (stateCode): Promise<StatePushFactor> => {
      const coords = refugesByState.get(stateCode) ?? []
      const [forecasts, alerts] = await Promise.all([
        Promise.all(coords.map(cp => getForecast(cp.lat, cp.lng))),
        getAlerts(stateCode),
      ])
      return { stateCode, ...scorePushForecasts(forecasts), activeAlerts: migrationAlertsFrom(alerts) }
    })
  )

  // Runs after the statewide pass on purpose: forecasts are cached per NWS grid
  // cell, so a region's points cost no extra forecast requests, only alerts.
  const regionJobs = PUSH_REGIONS
    .filter(r => stateCodes.includes(r.stateCode))
    .map(r => ({ region: r, coords: (refugesByState.get(r.stateCode) ?? []).filter(cp => pushRegionFor(r.stateCode, cp)?.id === r.id) }))
    .filter(j => j.coords.length > 0)
  const regionResults = await Promise.allSettled(
    regionJobs.map(async ({ region, coords }): Promise<StatePushFactor> => {
      const [forecasts, alertLists] = await Promise.all([
        Promise.all(coords.map(cp => getForecast(cp.lat, cp.lng))),
        Promise.all(coords.map(cp => getAlertsForPoint(cp.lat, cp.lng))),
      ])
      const seen = new Set<string>()
      const alerts = alertLists.flat().filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      return {
        stateCode: region.stateCode,
        regionId: region.id,
        regionName: region.name,
        ...scorePushForecasts(forecasts),
        activeAlerts: migrationAlertsFrom(alerts),
      }
    })
  )

  const fulfilled = (rs: PromiseSettledResult<StatePushFactor>[]) => rs
    .filter((r): r is PromiseFulfilledResult<StatePushFactor> => r.status === 'fulfilled')
    .map(r => r.value)
  const pushFactors = fulfilled(stateResults)
  const regionalPushFactors = fulfilled(regionResults)

  // Replace misleading max() with a list of states actually showing meaningful push
  // Threshold 1.5: at minimum two signals present (e.g. north wind + incoming front)
  const highPushStates = pushFactors
    .filter(f => f.pushScore >= 1.5)
    .sort((a, b) => b.pushScore - a.pushScore)
    .map(f => f.stateCode)

  return { pushFactors, regionalPushFactors, highPushStates }
}

/** "TX" for a statewide factor, "TX (Texas Panhandle & South Plains only)" for a regional one. */
export function pushFactorLabel(pf: Pick<StatePushFactor, 'stateCode' | 'regionName'>): string {
  return pf.regionName ? `${pf.stateCode} (${pf.regionName} only)` : pf.stateCode
}

/** The push factor that applies at a point: its region's if it has one, else its state's. */
export function pushFactorAt(
  stateCode: string,
  point: { lat: number; lng: number } | null | undefined,
  pushFactors: StatePushFactor[],
  regionalPushFactors: StatePushFactor[],
): StatePushFactor | undefined {
  const region = pushRegionFor(stateCode, point)
  return (region && regionalPushFactors.find(f => f.regionId === region.id))
    ?? pushFactors.find(f => f.stateCode === stateCode)
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

export function parseWindSpeed(windStr: string): number {
  const match = windStr.match(/(\d+)\s*(?:to\s*(\d+))?\s*mph/i)
  if (!match) return 0
  // Use higher value if range given (conservative)
  return match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10)
}

export function classifyWind(mph: number): 'calm' | 'light' | 'moderate' | 'strong' | 'dangerous' {
  if (mph <= 5) return 'calm'
  if (mph <= 10) return 'light'
  if (mph <= 20) return 'moderate'
  if (mph <= 30) return 'strong'
  return 'dangerous'
}

export function computeHuntingRating(
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
  _windMph: number,
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

  // Cold front detection: >=10°F drop where peak precedes trough in the next 12h window
  if (next12.length >= 2) {
    const { coldFrontPresent } = detectColdFront(next12)
    if (coldFrontPresent) {
      notes.push('Cold front arriving — prime hunting conditions expected')
    }
  }

  // South wind (birds moving back north or holding)
  if (windCat !== 'calm' && (dir === 'S' || dir === 'SW' || dir === 'SE')) {
    notes.push('South wind — birds may hold position or drift north')
  }

  return notes
}
