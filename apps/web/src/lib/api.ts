import { sendChat } from './account'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const DEFAULT_TIMEOUT_MS = 30_000

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
  timeoutMs?: number
}

/** One survey zone of a statewide survey's newest survey (AGFC's Arkansas zones). */
export type SurveyZone = {
  parentLocation: string
  region: string
  zone: string
  period: string
  surveyDate: string
  dateExact: boolean
  mallards: number
  totalDucks: number | null
  avgMallards: number | null
  avgTotalDucks: number | null
  yearsInAverage: number
}

/** One hunter report as the public API serves it: the map cell's center, never the exact point. */
export type FieldReportPublic = {
  id: string
  lat: number
  lng: number
  birdGroup: 'duck' | 'goose'
  speciesSlug: string | null
  speciesLabel: string
  countBucket: '1-10' | '10-50' | '50-200' | '200+'
  countExact: number | null
  activity: 'flying' | 'on_water' | 'in_field' | null
  observedAt: string
}

export type FieldReportsResponse = {
  label: string
  days: number
  reports: FieldReportPublic[]
}

/** An outfitter listing as the public API serves it. id is a uuid string. */
export type PublicListing = {
  id: string
  name: string
  slug: string
  city: string
  state: string
  statesServed: string[]
  speciesOffered: string[]
  huntTypes: string[]
  priceRange: string
  priceNote: string | null
  rating: number | null
  reviewCount: number
  description: string
  website: string | null
  phone: string | null
  isVerified: boolean
  /** true once an owner holds the listing; inquiries are only accepted then */
  claimed: boolean
}

export type OutfitterReview = {
  id: string
  rating: number
  title: string | null
  content: string | null
  huntDate: string | null
  createdAt: string
  reply: { body: string; updatedAt: string } | null
}

/** Returns the URL only when it parses as http or https; guards hrefs built from DB data. */
export function safeHttpUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { params, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options

    let url = `${this.baseUrl}${endpoint}`

    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
      const queryString = searchParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)

    // If the caller also passed a signal, either one aborting should abort the request.
    const callerSignal = fetchOptions.signal
    if (callerSignal) {
      if (callerSignal.aborted) timeoutController.abort()
      else callerSignal.addEventListener('abort', () => timeoutController.abort(), { once: true })
    }

    let response: Response
    try {
      response = await fetch(url, {
        ...fetchOptions,
        signal: timeoutController.signal,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError' && !callerSignal?.aborted) {
        throw new Error('Request timed out. Please check your connection and try again.')
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // Health check
  async health() {
    return this.request<{ status: string; timestamp: string }>('/api/health')
  }

  // Search
  async search(query: string, options?: {
    type?: 'all' | 'regulations' | 'species' | 'locations'
    state?: string
    limit?: number
    offset?: number
  }) {
    return this.request<{
      results: Array<{
        type: string
        id: string
        title: string
        snippet: string
        stateCode?: string
        category?: string
      }>
      total: number
      query: string
    }>('/api/search', {
      params: { q: query, ...options },
    })
  }

  async semanticSearch(query: string, limit = 10) {
    return this.request<{
      results: Array<{ content: string; metadata: unknown }>
      query: string
    }>('/api/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    })
  }

  // Regulations
  async getStates() {
    return this.request<{ states: Array<{
      code: string
      name: string
      agencyName: string | null
      agencyUrl: string | null
      regulationsUrl: string | null
      licenseUrl: string | null
    }> }>('/api/regulations/states')
  }

  async getRegulationCounts(year?: number) {
    return this.request<{
      counts: Record<string, { regulations: number; seasons: number; licenses: number }>
    }>('/api/regulations/counts', { params: year ? { year } : undefined })
  }

  async getStateRegulations(stateCode: string, options?: {
    category?: string
    species?: string
    year?: number
  }) {
    return this.request<{
      state: {
        code: string
        name: string
        agencyName: string | null
        agencyUrl: string | null
        regulationsUrl: string | null
        licenseUrl: string | null
        lastScraped: string | null
      }
      regulations: Array<{
        id: string
        category: string
        title: string
        content: string
        summary: string | null
        seasonYear: number | null
        effectiveDate: string | null
        expirationDate: string | null
        sourceUrl: string | null
        metadata: unknown
      }>
    }>(`/api/regulations/${stateCode}`, { params: options })
  }

  async getStateSeasons(stateCode: string, options?: {
    year?: number
    species?: string
  }) {
    return this.request<{
      state: string
      year: number
      seasons: Array<{
        id: string
        name: string
        seasonType: string | null
        startDate: string
        endDate: string
        year: number
        bagLimit: unknown
        shootingHours: unknown
        restrictions: string | null
        units: unknown
        sourceUrl: string | null
        speciesId: string
      }>
    }>(`/api/regulations/${stateCode}/seasons`, { params: options })
  }

  async getStateLicenses(stateCode: string, options?: {
    resident?: boolean
    type?: string
  }) {
    return this.request<{
      state: string
      licenses: Array<{
        id: string
        name: string
        licenseType: string
        description: string | null
        isResidentOnly: boolean | null
        priceResident: number | null
        priceNonResident: number | null
        validFor: unknown
        requirements: unknown
        applicationDeadline: string | null
        purchaseUrl: string | null
      }>
    }>(`/api/regulations/${stateCode}/licenses`, { params: options })
  }

  // Hunter field reports (public GET, sends no token; unverified)
  async getFieldReports(days = 7) {
    return this.request<FieldReportsResponse>('/api/field-reports', { params: { days } })
  }

  // Species
  async getSpecies(options?: {
    category?: string
  }) {
    return this.request<{
      species: Array<{
        id: string
        slug: string
        name: string
        scientificName: string | null
        category: string
        description: string | null
        habitat: string | null
        isMigratory: boolean | null
        flyways: unknown
        imageUrl: string | null
      }>
    }>('/api/species', { params: options })
  }

  async getSpeciesById(slug: string) {
    return this.request<{
      species: {
        id: string
        slug: string
        name: string
        scientificName: string | null
        category: string
        description: string | null
        habitat: string | null
        isMigratory: boolean | null
        flyways: unknown
        imageUrl: string | null
      }
      seasons: Array<{
        id: string
        name: string
        seasonType: string | null
        startDate: string
        endDate: string
        year: number
        bagLimit: unknown
        stateCode: string
        stateName: string
      }>
    }>(`/api/species/${slug}`)
  }

  async getSpeciesRegulations(slug: string, state?: string) {
    return this.request<{
      speciesSlug: string
      regulations: Array<{
        id: string
        category: string
        title: string
        content: string
        summary: string | null
        seasonYear: number | null
        sourceUrl: string | null
        metadata: unknown
        stateCode: string
        stateName: string
      }>
    }>(`/api/species/${slug}/regulations`, { params: { state } })
  }

  async getSpeciesMigration(slug: string, flyway?: string) {
    return this.request<{
      speciesSlug: string
      isMigratory: boolean
      flyways: string[]
      currentLocations: unknown[]
      historicalPatterns: unknown[]
    }>(`/api/species/${slug}/migration`, { params: { flyway } })
  }

  // Refuges & Migration
  async getMigrationDashboard(options?: {
    flyway?: string
    species?: string
  }) {
    return this.request<{
      surveyZones?: SurveyZone[]
      currentCounts: Array<{
        refugeId: string
        refugeName: string
        state: string
        species: string
        speciesName: string
        count: number
        surveyDate: string
        surveyType: string
        centerPoint: { lat: number; lng: number } | null
        flyway: string | null
        previousCount: number | null
        previousDate: string | null
        delta: number | null
        deltaPercent: number | null
        trend: 'increasing' | 'decreasing' | 'stable' | 'new'
      }>
      ebirdCounts: Array<{
        refugeId: string
        refugeName: string
        state: string
        species: string
        speciesName: string
        count: number
        surveyDate: string
        surveyType: 'ebird_recent'
        centerPoint: { lat: number; lng: number } | null
        flyway: string | null
        source: 'ebird'
        previousCount: null
        previousDate: null
        delta: null
        deltaPercent: null
        trend: 'new'
      }>
      /** eBird places checked with no duck or goose reports (5+) in the last 14 days */
      quietEbirdPlaces?: Array<{
        refugeId: string
        refugeName: string
        state: string
        centerPoint: { lat: number; lng: number }
      }>
      historicalTrends: Array<{
        year: number
        state_code: string
        species_slug: string
        total_count: number
      }>
    }>('/api/refuges/migration/dashboard', { params: options })
  }

  async geocodeZip(zip: string): Promise<{ lat: number; lng: number; city: string; state: string } | null> {
    try {
      return await this.request<{ lat: number; lng: number; city: string; state: string }>(`/api/geo/zip/${zip}`)
    } catch {
      return null
    }
  }

  async geocodeCity(q: string): Promise<{ lat: number; lng: number; city: string; state: string } | null> {
    try {
      return await this.request<{ lat: number; lng: number; city: string; state: string }>('/api/geo/search', { params: { q } })
    } catch {
      return null
    }
  }

  async geocodeReverse(lat: number, lng: number): Promise<{ lat: number; lng: number; city: string; state: string } | null> {
    try {
      return await this.request<{ lat: number; lng: number; city: string; state: string }>('/api/geo/reverse', { params: { lat, lng } })
    } catch {
      return null
    }
  }

  async getRefuges(options?: {
    state?: string
    flyway?: string
  }) {
    return this.request<{
      refuges: Array<{
        id: string
        name: string
        state: string
        stateName: string
        centerPoint: unknown
        acreage: number | null
        websiteUrl: string | null
        flyway: string | null
        surveyUrl: string | null
      }>
      count: number
    }>('/api/refuges', { params: options })
  }

  async getSurveyCoverage() {
    return this.request<{
      sites: number
      states: Array<{ state: string; sites: number }>
    }>('/api/refuges/coverage')
  }

  async getRefugeCounts(refugeId: string, options?: {
    species?: string
    startDate?: string
    endDate?: string
    limit?: number
  }) {
    return this.request<{
      refuge: { id: string; name: string }
      counts: Array<{
        surveyDate: string
        count: number
        surveyType: string
        speciesSlug: string
        speciesName: string
        sourceUrl: string | null
        observers: string | null
        notes: string | null
        previousCount: number | null
        previousDate: string | null
        delta: number | null
        deltaPercent: number | null
        trend: 'increasing' | 'decreasing' | 'stable' | 'new'
      }>
      total: number
    }>(`/api/refuges/${refugeId}/counts`, { params: options })
  }

  // Outfitters (public GETs; no token is ever sent from this client)
  async getOutfitters(options?: {
    q?: string
    state?: string
    species?: string
    priceRange?: string
    limit?: number
    offset?: number
  }) {
    return this.request<{
      outfitters: PublicListing[]
      total: number
      states: string[]
    }>('/api/outfitters', { params: options })
  }

  /** Accepts the uuid, the slug or a legacy id (tx-01..tx-14). */
  async getOutfitterById(idOrSlug: string) {
    return this.request<{ outfitter: PublicListing }>(`/api/outfitters/${encodeURIComponent(idOrSlug)}`)
  }

  async getOutfitterReviews(idOrSlug: string) {
    return this.request<{ reviews: OutfitterReview[] }>(
      `/api/outfitters/${encodeURIComponent(idOrSlug)}/reviews`,
    )
  }

  /** Fire-and-forget: records a Call or Website tap. Never throws, never blocks navigation. */
  recordContactClick(id: string, kind: 'call' | 'website'): void {
    try {
      void fetch(`${this.baseUrl}/api/outfitters/${encodeURIComponent(id)}/contact-click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      // swallowed on purpose
    }
  }

  // Chat
  // Sends the sign-in token when there is one; see lib/account.ts for the allowance errors
  async chat(
    message: string,
    conversationId?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    return sendChat(message, conversationId, history)
  }

  // Weather
  async getRefugeForecast(refugeId: string) {
    return this.request<{
      refuge: { id: string; name: string; state: string }
      forecast: Array<{
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
      }>
    }>(`/api/weather/forecast/${refugeId}`)
  }

  async getWeatherAlerts(states?: string) {
    return this.request<{
      alerts: Array<{
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
      }>
      states: string[]
      fetchedAt: string
    }>('/api/weather/alerts', {
      params: states ? { states } : undefined,
    })
  }

  async getHuntingConditions(refugeId: string) {
    return this.request<{
      refuge: { id: string; name: string; state: string }
      conditions: {
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
        forecast: Array<{
          name: string
          startTime: string
          temperature: number
          temperatureUnit: string
          windSpeed: string
          windDirection: string
          shortForecast: string
          precipitationChance: number | null
        }>
        alerts: Array<{
          id: string
          event: string
          headline: string | null
          severity: string
          expires: string
          areaDesc: string
        }>
      }
    }>(`/api/weather/hunting-conditions/${refugeId}`)
  }

  // Migration Intelligence
  async getMigrationWeeklySummary(options?: {
    flyway?: string
    species?: string
    refresh?: boolean
  }) {
    return this.request<{
      summary: string
      generatedAt: string
      cached: boolean
    }>('/api/migration/weekly-summary', { params: options, timeoutMs: 60_000 }) // LLM generation on cache miss
  }

  async getFlywayProgression(options?: {
    species?: string
    flyway?: string
    year?: number
    seasons?: number
  }) {
    return this.request<{
      seasonYear: number
      seasonWindow: { start: string; end: string }
      weeks: string[]
      states: Array<{
        stateCode: string
        stateName: string
        latitude: number
        weeks: Array<{ weekStart: string; totalCount: number }>
        peakWeek: string | null
        peakCount: number
      }>
      species: string | null
      flyway: string | null
    }>('/api/migration/flyway-progression', { params: options })
  }

  async getMigrationPushFactors(states?: string) {
    type PushFactorDTO = {
      stateCode: string
      /** Set on a sub-state region's factor, e.g. 'TX-HP' (Texas High Plains duck zone) */
      regionId?: string
      regionName?: string
      pushScore: number
      coldFrontPresent: boolean
      coldFrontIncoming: boolean
      windDirection: string | null
      windIsFromNorth: boolean
      temperature: number | null
      temperatureUnit: string | null
      activeAlerts: Array<{
        event: string
        severity: string
        headline: string | null
      }>
    }
    return this.request<{
      pushFactors: PushFactorDTO[]
      /** Absent from APIs older than v0.2.1 */
      regionalPushFactors?: PushFactorDTO[]
      highPushStates: string[]
      fetchedAt: string
    }>('/api/migration/push-factors', {
      params: states ? { states } : undefined,
    })
  }

  async getMigrationRegionalActivity(options?: {
    flyway?: string
    species?: string
    states?: string
  }) {
    return this.request<{
      stateActivity: Array<{
        state: string
        flyway: string | null
        totalCurrentCount: number
        totalPlaces: number
        totalPreviousCount: number | null
        overallDelta: number | null
        overallDeltaPercent: number | null
        activityLevel: 'high' | 'moderate' | 'low'
        topSpecies: Array<{
          species: string
          speciesName: string
          count: number
          places: number
          trend: 'increasing' | 'decreasing' | 'stable' | 'new'
          delta: number | null
          deltaPercent: number | null
          activityLevel: 'high' | 'moderate' | 'low'
        }>
        fetchedAt: string
      }>
      flywayRollup: Array<{
        flyway: string
        totalCurrentCount: number
        totalPlaces: number
        totalPreviousCount: number | null
        delta: number | null
        deltaPercent: number | null
      }>
      fetchedAt: string
      source: string
      attribution: string
    }>('/api/migration/regional-activity', { params: options })
  }

  // Hunt Recommendations
  async getHuntRecommendations(options?: {
    species?: string
    states?: string
    date?: string
    limit?: number
    includeNoAccess?: boolean
  }) {
    return this.request<{
      recommendations: Array<{
        rank: number
        score: number
        locationId: string
        locationName: string
        locationType: string
        state: string
        flyway: string | null
        centerPoint: { lat: number; lng: number } | null
        websiteUrl: string | null
        species: string
        speciesName: string
        latestCount: number | null
        surveyDate: string | null
        trend: 'increasing' | 'decreasing' | 'stable' | 'new' | 'no_data'
        delta: number | null
        deltaPercent: number | null
        migrationStatus: 'arriving' | 'building' | 'peak' | 'declining' | 'departing' | 'first_survey' | 'no_data' | null
        isAnomaly: boolean
        pushScore: number
        coldFrontPresent: boolean
        coldFrontIncoming: boolean
        seasonOpen: boolean
        // Optional while an older API is still deployed
        seasonStatus?: 'open' | 'closed' | 'unknown'
        access?: 'public' | 'limited' | 'closed' | 'private' | 'unknown'
        accessNote?: string | null
        accessSource?: string | null
        seasonName: string | null
        seasonStart: string | null
        seasonEnd: string | null
        bagLimit: unknown
        weatherRating: 'excellent' | 'good' | 'fair' | 'poor' | null
        temperature: number | null
        temperatureUnit: string | null
        windSpeed: string | null
        conditions: string | null
        scoreBreakdown: {
          trendScore: number
          magnitudeScore: number
          seasonScore: number
          weatherScore: number
          pushScore: number
          migrationScore: number
          anomalyBonus: number
        }
      }>
      queryParams: { species: string | null; states: string[]; date: string }
      totalLocations: number
      hiddenNoAccess?: number
      statesWithoutSeasonData?: string[]
    }>('/api/hunt/recommendations', { params: options })
  }
}

export const api = new ApiClient(API_URL)
