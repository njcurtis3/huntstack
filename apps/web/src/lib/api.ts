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
    type?: 'all' | 'regulations' | 'species' | 'outfitters' | 'locations'
    state?: string
    species?: string
    limit?: number
    offset?: number
  }) {
    return this.request('/api/search', {
      params: { q: query, ...options },
    })
  }

  async semanticSearch(query: string, limit = 10) {
    return this.request('/api/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    })
  }

  // Regulations
  async getStates() {
    return this.request<{ states: Array<{
      code: string
      name: string
      lastUpdated: string
      categories: string[]
    }> }>('/api/regulations/states')
  }

  async getStateRegulations(stateCode: string, options?: {
    category?: string
    species?: string
  }) {
    return this.request(`/api/regulations/${stateCode}`, { params: options })
  }

  async getStateSeasons(stateCode: string, options?: {
    year?: number
    species?: string
  }) {
    return this.request(`/api/regulations/${stateCode}/seasons`, { params: options })
  }

  async getStateLicenses(stateCode: string, options?: {
    resident?: boolean
    species?: string
  }) {
    return this.request(`/api/regulations/${stateCode}/licenses`, { params: options })
  }

  // Species
  async getSpecies(options?: {
    category?: string
    state?: string
  }) {
    return this.request('/api/species', { params: options })
  }

  async getSpeciesById(id: string) {
    return this.request(`/api/species/${id}`)
  }

  async getSpeciesRegulations(id: string, state?: string) {
    return this.request(`/api/species/${id}/regulations`, { params: { state } })
  }

  async getSpeciesMigration(id: string, flyway?: string) {
    return this.request(`/api/species/${id}/migration`, { params: { flyway } })
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
