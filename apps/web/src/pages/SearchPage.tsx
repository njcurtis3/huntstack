import { useState } from 'react'
import { Search, Filter, MapPin } from 'lucide-react'

export function SearchPage() {
  const [query, setQuery] = useState('')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Search Hunting Opportunities</h1>
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by species, location, or keywords..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
          <button className="btn-outline flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button className="px-3 py-1.5 bg-forest-100 text-forest-700 rounded-full text-sm font-medium">
          All Species
        </button>
        <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200">
          Waterfowl
        </button>
        <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200">
          Big Game
        </button>
        <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200">
          Upland
        </button>
        <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200">
          Small Game
        </button>
      </div>

      {/* Results Placeholder */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse" />
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                In Season
              </span>
            </div>
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-2 animate-pulse" />
            <div className="h-4 bg-gray-100 rounded w-1/2 mb-4 animate-pulse" />
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="w-4 h-4" />
              <span>Loading...</span>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State - shown when API is connected */}
      <div className="hidden text-center py-16">
        <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
        <p className="text-gray-600">Try adjusting your search or filters</p>
      </div>
    </div>
  )
}
