import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, FileText, Calendar, AlertCircle } from 'lucide-react'

const states = [
  { code: 'CO', name: 'Colorado', updated: '2025-01-15' },
  { code: 'MT', name: 'Montana', updated: '2025-01-10' },
  { code: 'WY', name: 'Wyoming', updated: '2025-01-12' },
  { code: 'TX', name: 'Texas', updated: '2025-01-08' },
  { code: 'AR', name: 'Arkansas', updated: '2025-01-05' },
  { code: 'LA', name: 'Louisiana', updated: '2025-01-03' },
  { code: 'SD', name: 'South Dakota', updated: '2025-01-14' },
  { code: 'KS', name: 'Kansas', updated: '2025-01-11' },
  { code: 'WI', name: 'Wisconsin', updated: '2025-01-09' },
  { code: 'MI', name: 'Michigan', updated: '2025-01-07' },
]

export function RegulationsPage() {
  const { state } = useParams()
  const [selectedCategory, setSelectedCategory] = useState('all')

  if (state) {
    // State detail view
    const stateInfo = states.find(s => s.code === state.toUpperCase())
    
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link to="/regulations" className="hover:text-gray-700">Regulations</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900">{stateInfo?.name || state}</span>
        </nav>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {stateInfo?.name || state} Hunting Regulations
            </h1>
            <p className="text-gray-600 mt-2">
              Last updated: {stateInfo?.updated || 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              Always verify with official state sources
            </span>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {['all', 'big-game', 'waterfowl', 'upland', 'small-game', 'licenses'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-forest-100 text-forest-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat === 'all' ? 'All' : cat.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </div>

        {/* Regulations Content Placeholder */}
        <div className="space-y-6">
          {['Deer Season', 'Elk Season', 'Waterfowl Season', 'License Requirements'].map((section) => (
            <div key={section} className="card">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">{section}</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse" />
                </div>
                <p className="text-sm text-gray-500 mt-4">
                  Regulations data will be loaded from the database
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // State list view
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Hunting Regulations by State</h1>
        <p className="text-gray-600 mt-2">
          Select a state to view current hunting regulations, seasons, and license requirements.
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <input
          type="text"
          placeholder="Search states..."
          className="input max-w-md"
        />
      </div>

      {/* State Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {states.map((s) => (
          <Link
            key={s.code}
            to={`/regulations/${s.code.toLowerCase()}`}
            className="card p-4 hover:shadow-md transition-shadow flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-forest-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-forest-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{s.name}</h3>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Calendar className="w-3 h-3" />
                  Updated {s.updated}
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>
        ))}
      </div>

      {/* More states coming soon */}
      <div className="mt-8 text-center py-8 bg-gray-50 rounded-xl">
        <p className="text-gray-600">
          More states coming soon. We're actively adding regulations for all 50 states.
        </p>
      </div>
    </div>
  )
}
