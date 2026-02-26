const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options
    
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

    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    })

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

  async getStateRegulations(stateCode: string, options?: {
    category?: string
    species?: string
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
      historicalTrends: Array<{
        year: number
        state_code: string
        species_slug: string
        total_count: number
      }>
    }>('/api/refuges/migration/dashboard', { params: options })
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

  // Outfitters
  async getOutfitters(options?: {
    q?: string
    state?: string
    huntType?: string
    species?: string
    minRating?: number
    limit?: number
    offset?: number
  }) {
    return this.request('/api/outfitters', { params: options })
  }

  async getOutfitterById(id: string) {
    return this.request(`/api/outfitters/${id}`)
  }

  async getOutfitterReviews(id: string, options?: {
    limit?: number
    offset?: number
  }) {
    return this.request(`/api/outfitters/${id}/reviews`, { params: options })
  }

  // Chat
  async chat(message: string, conversationId?: string) {
    return this.request<{
      response: string
      sources: Array<{ title: string; url?: string; snippet: string }>
      conversationId: string
    }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
    })
  }

  async getChatHistory(conversationId: string) {
    return this.request(`/api/chat/history/${conversationId}`)
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
    }>('/api/migration/weekly-summary', { params: options })
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
    return this.request<{
      pushFactors: Array<{
        stateCode: string
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
      }>
      overallPushScore: number
      fetchedAt: string
    }>('/api/migration/push-factors', {
      params: states ? { states } : undefined,
    })
  }

  // Hunt Recommendations
  async getHuntRecommendations(options?: {
    species?: string
    states?: string
    date?: string
    limit?: number
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
        seasonOpen: boolean
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
        }
      }>
      queryParams: { species: string | null; states: string[]; date: string }
      totalLocations: number
    }>('/api/hunt/recommendations', { params: options })
  }
}

export const api = new ApiClient(API_URL)
