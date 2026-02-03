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
        <h1 className="text-3xl font-bold text-gray-900">Find Outfitters</h1>
        <p className="text-gray-600 mt-2">
          Discover verified hunting guides and outfitters across the country.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
            className="btn-outline flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expandable Filters */}
        {showFilters && (
          <div className="card p-6 grid md:grid-cols-4 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hunt Type
              </label>
              <select className="input">
                <option>All Types</option>
                <option>Waterfowl</option>
                <option>Big Game</option>
                <option>Upland</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State
              </label>
              <select className="input">
                <option>All States</option>
                <option>Colorado</option>
                <option>Montana</option>
                <option>Texas</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price Range
              </label>
              <select className="input">
                <option>Any Price</option>
                <option>$ - Budget</option>
                <option>$$ - Moderate</option>
                <option>$$$ - Premium</option>
                <option>$$$$ - Luxury</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rating
              </label>
              <select className="input">
                <option>Any Rating</option>
                <option>4+ Stars</option>
                <option>4.5+ Stars</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockOutfitters.map((outfitter) => (
          <div key={outfitter.id} className="card hover:shadow-lg transition-shadow">
            {/* Image placeholder */}
            <div className="h-48 bg-gradient-to-br from-forest-200 to-earth-200 flex items-center justify-center">
              <span className="text-4xl">🏕️</span>
            </div>
            
            <div className="p-6">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{outfitter.name}</h3>
                <span className="text-sm font-medium text-gray-500">{outfitter.priceRange}</span>
              </div>
              
              <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                <MapPin className="w-4 h-4" />
                {outfitter.location}
              </div>

              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-400 fill-current" />
                  <span className="font-medium">{outfitter.rating}</span>
                </div>
                <span className="text-sm text-gray-500">({outfitter.reviews} reviews)</span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {outfitter.huntTypes.map((type) => (
                  <span 
                    key={type}
                    className="px-2 py-1 bg-forest-50 text-forest-700 text-xs rounded-full"
                  >
                    {type}
                  </span>
                ))}
              </div>

              <button className="btn-primary w-full">View Details</button>
            </div>
          </div>
        ))}
      </div>

      {/* CTA for Outfitters */}
      <div className="mt-12 bg-gradient-to-r from-earth-800 to-earth-900 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-4">Are You an Outfitter?</h2>
        <p className="text-earth-200 mb-6 max-w-2xl mx-auto">
          Join HuntStack to reach thousands of hunters looking for their next adventure. 
          Get your business listed and start connecting with clients today.
        </p>
        <button className="btn bg-white text-earth-900 hover:bg-earth-50">
          List Your Business
        </button>
      </div>
    </div>
  )
}
