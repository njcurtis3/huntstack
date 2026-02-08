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
}

export const api = new ApiClient(API_URL)
