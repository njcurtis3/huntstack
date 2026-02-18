import { useState } from 'react'
import { Search, MapPin, FileText, Bird, TreePine, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

type SearchResult = {
  type: string
  id: string
  title: string
  snippet: string
  stateCode?: string
  category?: string
}

const categoryFilters = [
  { value: 'all', label: 'All' },
  { value: 'species', label: 'Species' },
  { value: 'regulations', label: 'Regulations' },
  { value: 'locations', label: 'Locations' },
] as const

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const handleSearch = async (filterOverride?: string) => {
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setSearched(true)
    try {
      const filter = filterOverride ?? activeFilter
      const data = await api.search(q, {
        type: filter as 'all' | 'regulations' | 'species' | 'locations',
      })
      setResults((data as { results: SearchResult[] }).results)
      setTotal((data as { total: number }).total)
    } catch {
      setResults([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (value: string) => {
    setActiveFilter(value)
    if (searched) {
      handleSearch(value)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'species': return <Bird className="w-5 h-5 text-forest-500" />
      case 'regulation': return <FileText className="w-5 h-5 text-accent-500" />
      case 'location': return <TreePine className="w-5 h-5 text-forest-500" />
      default: return <MapPin className="w-5 h-5 text-earth-500" />
    }
  }

  const getResultLink = (result: SearchResult) => {
    switch (result.type) {
      case 'species': return `/species/${result.id}`
      case 'regulation': return result.stateCode ? `/regulations/${result.stateCode.toLowerCase()}` : '/regulations'
      case 'location': return '/map'
      default: return '#'
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>Search Hunting Data</h1>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: `rgb(var(--color-text-tertiary))` }} />
            <input
              type="text"
              placeholder="Search species, regulations, locations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
          <button type="submit" className="btn-primary px-6" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
          </button>
        </form>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categoryFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              activeFilter === f.value
                ? 'bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 border-accent-300 dark:border-accent-700'
                : 'bg-earth-50 dark:bg-earth-800 text-earth-600 dark:text-earth-300 border-earth-200 dark:border-earth-700 hover:bg-earth-100 dark:hover:bg-earth-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
        </div>
      ) : searched ? (
        results.length > 0 ? (
          <>
            <p className="text-sm mb-4" style={{ color: `rgb(var(--color-text-tertiary))` }}>{total} result{total !== 1 ? 's' : ''} found</p>
            <div className="space-y-3">
              {results.map((result) => (
                <Link
                  key={`${result.type}-${result.id}`}
                  to={getResultLink(result)}
                  className="card p-4 block hover:border-accent-400 dark:hover:border-accent-500 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
                      {getResultIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>{result.title}</h3>
                        <span className="text-xs rounded-full px-2 py-0.5 capitalize bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-300">
                          {result.type}
                        </span>
                        {result.stateCode && (
                          <span className="text-xs rounded-full px-2 py-0.5 bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400">
                            {result.stateCode}
                          </span>
                        )}
                      </div>
                      {result.snippet && (
                        <p className="text-sm line-clamp-2" style={{ color: `rgb(var(--color-text-secondary))` }}>{result.snippet}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <Search className="w-12 h-12 mx-auto mb-4" style={{ color: `rgb(var(--color-text-tertiary))` }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>No results found</h3>
            <p style={{ color: `rgb(var(--color-text-secondary))` }}>Try different keywords or adjust your filters</p>
          </div>
        )
      ) : (
        <div className="text-center py-16">
          <Search className="w-12 h-12 mx-auto mb-4" style={{ color: `rgb(var(--color-text-tertiary))` }} />
          <h3 className="text-lg font-medium mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>Search hunting data</h3>
          <p style={{ color: `rgb(var(--color-text-secondary))` }}>Find species, regulations, and public hunting locations across the U.S.</p>
        </div>
      )}
    </div>
  )
}
