import { useState, useEffect, useMemo } from 'react'
import { Search, MapPin, BadgeCheck, Phone, Globe, ChevronDown, X, Users } from 'lucide-react'
import { api } from '../lib/api'

type Outfitter = {
  id: string
  name: string
  slug: string
  city: string
  state: string
  statesServed: string[]
  speciesOffered: string[]
  huntTypes: string[]
  priceRange: string
  priceNote: string
  rating: number | null
  reviewCount: number
  description: string
  website: string | null
  phone: string | null
  isVerified: boolean
}

// All V1 priority states — shown in pills even before they have listings
const ALL_V1_STATES = ['AR', 'KS', 'LA', 'MO', 'NM', 'OK', 'TX']

const STATE_NAMES: Record<string, string> = {
  AR: 'Arkansas',
  KS: 'Kansas',
  LA: 'Louisiana',
  MO: 'Missouri',
  NM: 'New Mexico',
  OK: 'Oklahoma',
  TX: 'Texas',
}

const PRICE_LABELS: Record<string, string> = {
  '$': 'Budget',
  '$$': 'Moderate',
  '$$$': 'Premium',
  '$$$$': 'Luxury',
}

const HUNT_TYPE_LABELS: Record<string, string> = {
  'guided': 'Fully Guided',
  'semi-guided': 'Semi-Guided',
  'diy-support': 'DIY Support',
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-3.5 h-3.5 ${star <= Math.round(rating) ? 'text-yellow-400 fill-current' : 'text-earth-300 dark:text-earth-600'}`}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

function OutfitterCard({ outfitter }: { outfitter: Outfitter }) {
  return (
    <div
      className="rounded-lg border flex flex-col"
      style={{
        backgroundColor: `rgb(var(--color-bg-elevated))`,
        borderColor: `rgb(var(--color-border-primary))`,
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>
                {outfitter.name}
              </h3>
              {outfitter.isVerified && (
                <BadgeCheck className="w-4 h-4 text-accent-500 dark:text-accent-400 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: `rgb(var(--color-text-secondary))` }}>
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span>{outfitter.city}, {outfitter.state}</span>
            </div>
          </div>
          {/* Price badge */}
          <div className="flex-shrink-0 text-right">
            <span className="text-sm font-bold text-forest-500 dark:text-forest-400">{outfitter.priceRange}</span>
            <div className="text-xs mt-0.5" style={{ color: `rgb(var(--color-text-tertiary))` }}>
              {PRICE_LABELS[outfitter.priceRange] ?? ''}
            </div>
          </div>
        </div>
        {/* Rating */}
        {outfitter.rating != null ? (
          <div className="flex items-center gap-2 mt-2">
            <StarRating rating={outfitter.rating} />
            <span className="text-xs font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
              {outfitter.rating.toFixed(1)}
            </span>
            <span className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
              ({outfitter.reviewCount} reviews)
            </span>
          </div>
        ) : (
          <div className="mt-2 text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
            No reviews yet
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex-1 flex flex-col gap-3">
        <p className="text-xs leading-relaxed" style={{ color: `rgb(var(--color-text-secondary))` }}>
          {outfitter.description}
        </p>

        {/* Tags */}
        <div className="flex flex-col gap-1.5">
          {/* State + hunt type */}
          <div className="flex flex-wrap gap-1">
            {outfitter.statesServed.map((s) => (
              <span
                key={s}
                className="px-1.5 py-0.5 text-xs font-mono font-semibold rounded border"
                style={{
                  backgroundColor: `rgb(var(--color-bg-secondary))`,
                  borderColor: `rgb(var(--color-border-primary))`,
                  color: `rgb(var(--color-text-secondary))`,
                }}
              >
                {s}
              </span>
            ))}
            {outfitter.huntTypes.map((ht) => (
              <span
                key={ht}
                className="px-1.5 py-0.5 text-xs rounded bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 border border-accent-200 dark:border-accent-800/50"
              >
                {HUNT_TYPE_LABELS[ht] ?? ht}
              </span>
            ))}
          </div>
          {/* Species */}
          <div className="flex flex-wrap gap-1">
            {outfitter.speciesOffered.slice(0, 4).map((sp) => (
              <span
                key={sp}
                className="px-1.5 py-0.5 text-xs rounded bg-forest-50 dark:bg-forest-900/30 text-forest-700 dark:text-forest-400 border border-forest-200 dark:border-forest-800/50"
              >
                {sp}
              </span>
            ))}
            {outfitter.speciesOffered.length > 4 && (
              <span className="px-1.5 py-0.5 text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                +{outfitter.speciesOffered.length - 4} more
              </span>
            )}
          </div>
        </div>

        {/* Price note */}
        <div className="text-xs font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>
          {outfitter.priceNote}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t flex items-center gap-2" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
        {outfitter.phone && (
          <a href={`tel:${outfitter.phone}`} className="flex items-center gap-1.5 text-xs btn-secondary px-2.5 py-1.5">
            <Phone className="w-3 h-3" />
            Call
          </a>
        )}
        {outfitter.website && (
          <a
            href={outfitter.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs btn-secondary px-2.5 py-1.5"
          >
            <Globe className="w-3 h-3" />
            Website
          </a>
        )}
        {!outfitter.phone && !outfitter.website && (
          <span className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
            Contact info coming soon
          </span>
        )}
        {outfitter.isVerified && (
          <span className="ml-auto flex items-center gap-1 text-xs text-accent-500 dark:text-accent-400">
            <BadgeCheck className="w-3.5 h-3.5" />
            Verified
          </span>
        )}
      </div>
    </div>
  )
}

export function OutfittersPage() {
  const [outfitters, setOutfitters] = useState<Outfitter[]>([])
  const [availableStates, setAvailableStates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedState, setSelectedState] = useState<string>('')
  const [selectedPrice, setSelectedPrice] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await api.getOutfitters({ limit: 100 })
        setOutfitters(data.outfitters)
        setAvailableStates(data.states)
      } catch {
        setError('Failed to load outfitters.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    let results = outfitters
    if (selectedState) {
      results = results.filter(o =>
        o.state === selectedState || o.statesServed.includes(selectedState)
      )
    }
    if (selectedPrice) {
      results = results.filter(o => o.priceRange === selectedPrice)
    }
    if (searchQuery.trim()) {
      const needle = searchQuery.toLowerCase()
      results = results.filter(o =>
        o.name.toLowerCase().includes(needle) ||
        o.city.toLowerCase().includes(needle) ||
        o.speciesOffered.some(s => s.toLowerCase().includes(needle))
      )
    }
    return results
  }, [outfitters, selectedState, selectedPrice, searchQuery])

  const hasActiveFilters = selectedState || selectedPrice || searchQuery.trim()

  const groupedByState = useMemo(() => {
    if (selectedState || searchQuery.trim()) return null
    const groups: Record<string, Outfitter[]> = {}
    for (const o of filtered) {
      if (!groups[o.state]) groups[o.state] = []
      groups[o.state].push(o)
    }
    return groups
  }, [filtered, selectedState, searchQuery])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
          Outfitter Directory
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
          Verified waterfowl outfitters across the Central and Mississippi Flyways.
          {!loading && outfitters.length > 0 && <span className="ml-1">{outfitters.length} listed — TX fully populated. Other states coming soon.</span>}
        </p>
      </div>

      {/* Search + filters */}
      <div className="mb-5 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: `rgb(var(--color-text-tertiary))` }} />
            <input
              type="text"
              placeholder="Search by name, location, or species..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9 text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary flex items-center gap-1.5 text-sm ${showFilters ? 'ring-1 ring-accent-400' : ''}`}
          >
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          {hasActiveFilters && (
            <button
              onClick={() => { setSelectedState(''); setSelectedPrice(''); setSearchQuery('') }}
              className="btn-secondary flex items-center gap-1.5 text-sm"
              style={{ color: 'rgb(209 36 47)' }}
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div
            className="rounded-lg border p-4 grid grid-cols-2 gap-4"
            style={{
              backgroundColor: `rgb(var(--color-bg-secondary))`,
              borderColor: `rgb(var(--color-border-primary))`,
            }}
          >
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: `rgb(var(--color-text-secondary))` }}>
                State
              </label>
              <select className="input text-sm" value={selectedState} onChange={(e) => setSelectedState(e.target.value)}>
                <option value="">All States</option>
                {availableStates.map((s) => (
                  <option key={s} value={s}>{STATE_NAMES[s] ?? s} ({s})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: `rgb(var(--color-text-secondary))` }}>
                Price Range
              </label>
              <select className="input text-sm" value={selectedPrice} onChange={(e) => setSelectedPrice(e.target.value)}>
                <option value="">Any Price</option>
                {Object.entries(PRICE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{val} — {label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* State pill filters */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedState('')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            !selectedState
              ? 'bg-forest-600 dark:bg-forest-700 text-white border-transparent'
              : 'border-earth-300 dark:border-earth-600 hover:border-forest-400 dark:hover:border-forest-600'
          }`}
          style={!selectedState ? {} : { color: `rgb(var(--color-text-secondary))` }}
        >
          All States
        </button>
        {ALL_V1_STATES.map((s) => {
          const hasListings = availableStates.includes(s)
          const isSelected = selectedState === s
          return (
            <button
              key={s}
              onClick={() => setSelectedState(isSelected ? '' : s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                isSelected
                  ? 'bg-forest-600 dark:bg-forest-700 text-white border-transparent'
                  : hasListings
                    ? 'border-earth-300 dark:border-earth-600 hover:border-forest-400 dark:hover:border-forest-600'
                    : 'border-earth-200 dark:border-earth-700 opacity-50 cursor-default'
              }`}
              style={!isSelected ? { color: `rgb(var(--color-text-secondary))` } : {}}
              title={hasListings ? undefined : 'No listings yet'}
            >
              {s}
              {!hasListings && <span className="ml-1 text-[10px] opacity-60">soon</span>}
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
          Loading outfitters...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div
              className="rounded-lg border p-12 text-center"
              style={{
                backgroundColor: `rgb(var(--color-bg-secondary))`,
                borderColor: `rgb(var(--color-border-primary))`,
              }}
            >
              <Users className="w-10 h-10 mx-auto mb-4 opacity-30" style={{ color: `rgb(var(--color-text-secondary))` }} />
              <h3 className="text-base font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
                {selectedState && !availableStates.includes(selectedState)
                  ? `${STATE_NAMES[selectedState] ?? selectedState} listings coming soon`
                  : 'No outfitters match your filters'}
              </h3>
              <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: `rgb(var(--color-text-secondary))` }}>
                {selectedState && !availableStates.includes(selectedState)
                  ? `We're actively curating verified outfitters for ${STATE_NAMES[selectedState] ?? selectedState}. In the meantime, are you an outfitter in this state?`
                  : 'Try adjusting your filters or clearing your search.'}
              </p>
              {selectedState && !availableStates.includes(selectedState) && (
                <button className="btn-primary text-sm px-5 py-2">Request a Listing</button>
              )}
            </div>
          ) : groupedByState ? (
            // Grouped by state
            <div className="space-y-10">
              {Object.entries(groupedByState)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([stateCode, group]) => (
                  <div key={stateCode}>
                    <div
                      className="flex items-center gap-3 mb-4 pb-2 border-b"
                      style={{ borderColor: `rgb(var(--color-border-primary))` }}
                    >
                      <span
                        className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                        style={{
                          backgroundColor: `rgb(var(--color-bg-secondary))`,
                          borderColor: `rgb(var(--color-border-primary))`,
                          color: `rgb(var(--color-text-secondary))`,
                        }}
                      >
                        {stateCode}
                      </span>
                      <h2 className="text-base font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
                        {STATE_NAMES[stateCode] ?? stateCode}
                      </h2>
                      <span className="text-sm" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                        {group.length} outfitter{group.length !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => setSelectedState(stateCode)}
                        className="ml-auto text-xs text-accent-500 dark:text-accent-400 hover:underline"
                      >
                        View only {stateCode}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {group.map((o) => <OutfitterCard key={o.id} outfitter={o} />)}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            // Flat grid (state filtered or search)
            <>
              <div className="mb-4 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
                {filtered.length} outfitter{filtered.length !== 1 ? 's' : ''}
                {selectedState ? ` in ${STATE_NAMES[selectedState] ?? selectedState}` : ''}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((o) => <OutfitterCard key={o.id} outfitter={o} />)}
              </div>
            </>
          )}
        </>
      )}

      {/* CTA */}
      <div
        className="mt-16 rounded-lg border p-8 text-center"
        style={{
          backgroundColor: `rgb(var(--color-bg-secondary))`,
          borderColor: `rgb(var(--color-border-primary))`,
        }}
      >
        <h2 className="text-lg font-bold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
          Are You an Outfitter?
        </h2>
        <p className="text-sm mb-5 max-w-xl mx-auto" style={{ color: `rgb(var(--color-text-secondary))` }}>
          Get listed in the HuntStack directory and reach hunters who are actively researching where to go.
          Listings include species, price range, hunt type, and a direct link to your website.
        </p>
        <button className="btn-primary text-sm px-5 py-2">
          Request a Listing
        </button>
      </div>
    </div>
  )
}
