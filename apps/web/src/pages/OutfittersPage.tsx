import { useState } from 'react'
import { Search, MapPin, Star, Filter, ChevronDown } from 'lucide-react'

const mockOutfitters = [
  {
    id: '1',
    name: 'Rocky Mountain Outfitters',
    location: 'Gunnison, CO',
    rating: 4.8,
    reviews: 124,
    huntTypes: ['Elk', 'Mule Deer', 'Bear'],
    priceRange: '$$$',
    image: null,
  },
  {
    id: '2',
    name: 'Delta Waterfowl Lodge',
    location: 'Stuttgart, AR',
    rating: 4.9,
    reviews: 89,
    huntTypes: ['Mallard', 'Pintail', 'Teal'],
    priceRange: '$$',
    image: null,
  },
  {
    id: '3',
    name: 'Big Sky Hunting Co',
    location: 'Bozeman, MT',
    rating: 4.7,
    reviews: 156,
    huntTypes: ['Elk', 'Whitetail', 'Pronghorn'],
    priceRange: '$$$$',
    image: null,
  },
]

export function OutfittersPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>Find Outfitters</h1>
        <p className="mt-2 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
          Discover verified hunting guides and outfitters across the country.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: `rgb(var(--color-text-tertiary))` }} />
            <input
              type="text"
              placeholder="Search by name, location, or hunt type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="card p-5 grid md:grid-cols-4 gap-4">
            {[
              { label: 'Hunt Type', options: ['All Types', 'Waterfowl', 'Big Game', 'Upland'] },
              { label: 'State', options: ['All States', 'Colorado', 'Montana', 'Texas'] },
              { label: 'Price Range', options: ['Any Price', '$ - Budget', '$$ - Moderate', '$$$ - Premium', '$$$$ - Luxury'] },
              { label: 'Rating', options: ['Any Rating', '4+ Stars', '4.5+ Stars'] },
            ].map(({ label, options }) => (
              <div key={label}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: `rgb(var(--color-text-secondary))` }}>
                  {label}
                </label>
                <select className="input text-sm">
                  {options.map((opt) => <option key={opt}>{opt}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockOutfitters.map((outfitter) => (
          <div key={outfitter.id} className="card hover:border-accent-400 dark:hover:border-accent-500 transition-colors">
            <div className="h-40 flex items-center justify-center" style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
              <span className="text-4xl">🏕️</span>
            </div>

            <div className="p-5">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>{outfitter.name}</h3>
                <span className="text-xs font-medium" style={{ color: `rgb(var(--color-text-tertiary))` }}>{outfitter.priceRange}</span>
              </div>

              <div className="flex items-center gap-1 text-xs mb-3" style={{ color: `rgb(var(--color-text-secondary))` }}>
                <MapPin className="w-3.5 h-3.5" />
                {outfitter.location}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
                  <span className="text-sm font-medium" style={{ color: `rgb(var(--color-text-primary))` }}>{outfitter.rating}</span>
                </div>
                <span className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>({outfitter.reviews} reviews)</span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {outfitter.huntTypes.map((type) => (
                  <span
                    key={type}
                    className="px-2 py-0.5 text-xs rounded-full bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-300"
                  >
                    {type}
                  </span>
                ))}
              </div>

              <button className="btn-primary w-full text-sm">View Details</button>
            </div>
          </div>
        ))}
      </div>

      {/* CTA for Outfitters */}
      <div className="mt-12 card p-8 text-center bg-earth-900 dark:bg-[#161b22] border-earth-800 dark:border-[#30363d]">
        <h2 className="text-xl font-semibold text-white mb-3">Are You an Outfitter?</h2>
        <p className="text-earth-300 text-sm mb-6 max-w-2xl mx-auto">
          Join HuntStack to reach thousands of hunters looking for their next adventure.
          Get your business listed and start connecting with clients today.
        </p>
        <button className="btn bg-white text-earth-900 hover:bg-earth-100 text-sm px-6 py-2">
          List Your Business
        </button>
      </div>
    </div>
  )
}
