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
      case 'species': return <Bird className="w-5 h-5 text-forest-600" />
      case 'regulation': return <FileText className="w-5 h-5 text-blue-600" />
      case 'location': return <TreePine className="w-5 h-5 text-green-600" />
      default: return <MapPin className="w-5 h-5 text-gray-600" />
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">Search Hunting Data</h1>
        <form onSubmit={handleSubmit} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              activeFilter === f.value
                ? 'bg-forest-100 dark:bg-forest-950 text-forest-700 dark:text-forest-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
        </div>
      ) : searched ? (
        results.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{total} result{total !== 1 ? 's' : ''} found</p>
            <div className="space-y-4">
              {results.map((result) => (
                <Link
                  key={`${result.type}-${result.id}`}
                  to={getResultLink(result)}
                  className="card p-5 block hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                      {getResultIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{result.title}</h3>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5 capitalize">
                          {result.type}
                        </span>
                        {result.stateCode && (
                          <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded px-2 py-0.5">
                            {result.stateCode}
                          </span>
                        )}
                      </div>
                      {result.snippet && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{result.snippet}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No results found</h3>
            <p className="text-gray-600 dark:text-gray-400">Try different keywords or adjust your filters</p>
          </div>
        )
      ) : (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Search hunting data</h3>
          <p className="text-gray-600 dark:text-gray-400">Find species, regulations, and public hunting locations across the U.S.</p>
        </div>
      )}
    </div>
  )
}
