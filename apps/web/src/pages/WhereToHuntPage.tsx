import { useState, useEffect } from 'react'
import {
  Loader2, Crosshair, TrendingUp, TrendingDown, Minus, Sparkles,
  ExternalLink, CheckCircle2, XCircle, AlertCircle, Wind, Thermometer, Zap,
} from 'lucide-react'
import { api } from '../lib/api'

const V1_STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO']

type MigrationStatus = 'arriving' | 'building' | 'peak' | 'declining' | 'departing' | 'first_survey' | 'no_data'

type Recommendation = {
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
  migrationStatus: MigrationStatus | null
  isAnomaly: boolean
  pushScore: number
  coldFrontPresent: boolean
  coldFrontIncoming: boolean
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
    pushScore: number
    migrationScore: number
    anomalyBonus: number
  }
}

const MIGRATION_STATUS_CONFIG: Record<MigrationStatus, { label: string; className: string }> = {
  arriving:     { label: 'Arriving',     className: 'bg-forest-100 dark:bg-forest-900/40 text-forest-700 dark:text-forest-300' },
  building:     { label: 'Building',     className: 'bg-accent-100 dark:bg-accent-900/40 text-accent-700 dark:text-accent-300' },
  peak:         { label: 'Peak',         className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  declining:    { label: 'Declining',    className: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' },
  departing:    { label: 'Departing',    className: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  first_survey: { label: 'First Survey', className: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
  no_data:      { label: '',             className: '' },
}

type SpeciesOption = { slug: string; name: string }

const FLYWAY_COLORS: Record<string, string> = {
  central: 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300',
  mississippi: 'bg-forest-100 dark:bg-forest-900/30 text-forest-700 dark:text-forest-300',
  pacific: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  atlantic: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
}

const WEATHER_RATING_COLORS: Record<string, string> = {
  excellent: 'text-forest-600 dark:text-forest-400',
  good: 'text-accent-600 dark:text-accent-400',
  fair: 'text-amber-600 dark:text-amber-400',
  poor: 'text-red-600 dark:text-red-400',
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? '#1f883d' : score >= 45 ? '#bf8700' : '#cf222e'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'rgb(var(--color-border-primary))' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>
        {score}
      </span>
    </div>
  )
}

function TrendBadge({ trend, delta, deltaPercent }: {
  trend: 'increasing' | 'decreasing' | 'stable' | 'new' | 'no_data'
  delta: number | null
  deltaPercent: number | null
}) {
  if (trend === 'no_data') return null

  if (trend === 'new') {
    return (
      <span className="flex items-center gap-1 text-xs text-accent-500 dark:text-accent-400">
        <Sparkles className="w-3 h-3" />
        First survey
      </span>
    )
  }

  const formattedDelta = delta !== null ? `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}` : null
  const formattedPct = deltaPercent !== null
    ? ` (${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(1)}%)`
    : ''

  if (trend === 'stable') return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
      <Minus className="w-3 h-3" />
      {formattedDelta}{formattedPct}
    </span>
  )

  if (trend === 'increasing') return (
    <span className="flex items-center gap-1 text-xs text-forest-600 dark:text-forest-400">
      <TrendingUp className="w-3 h-3" />
      {formattedDelta}{formattedPct}
    </span>
  )

  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: '#cf222e' }}>
      <TrendingDown className="w-3 h-3" />
      {formattedDelta}{formattedPct}
    </span>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold bg-yellow-400 text-yellow-900">
      1
    </span>
  )
  if (rank === 2) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold bg-earth-300 dark:bg-earth-600 text-earth-800 dark:text-earth-100">
      2
    </span>
  )
  if (rank === 3) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold bg-amber-700 text-amber-50">
      3
    </span>
  )
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium border" style={{ color: 'rgb(var(--color-text-tertiary))', borderColor: 'rgb(var(--color-border-primary))' }}>
      {rank}
    </span>
  )
}

export function WhereToHuntPage() {
  const [selectedSpecies, setSelectedSpecies] = useState('')
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set(V1_STATES))
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [speciesOptions, setSpeciesOptions] = useState<SpeciesOption[]>([])

  const [results, setResults] = useState<Recommendation[] | null>(null)
  const [totalLocations, setTotalLocations] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Load species options on mount
  useEffect(() => {
    api.getSpecies({ category: 'waterfowl' }).then(data => {
      setSpeciesOptions(data.species.map(s => ({ slug: s.slug, name: s.name })))
    }).catch(() => {
      // Silently fail — dropdown just stays empty, user can still search all species
    })
  }, [])

  const toggleState = (code: string) => {
    setSelectedStates(prev => {
      const next = new Set(prev)
      if (next.has(code)) {
        if (next.size > 1) next.delete(code) // always keep at least one
      } else {
        next.add(code)
      }
      return next
    })
  }

  const handleSearch = async () => {
    setLoading(true)
    setError(null)
    setHasSearched(true)
    try {
      const data = await api.getHuntRecommendations({
        species: selectedSpecies || undefined,
        states: [...selectedStates].join(','),
        date: selectedDate,
        limit: 10,
      })
      setResults(data.recommendations)
      setTotalLocations(data.totalLocations)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recommendations')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const bagLimitStr = (bl: unknown): string | null => {
    if (!bl) return null
    if (typeof bl === 'object' && bl !== null) {
      const b = bl as Record<string, unknown>
      if (b.daily) return `${b.daily}/day`
    }
    return null
  }

  return (
    <div>
      {/* Hero */}
      <div className="bg-earth-900 dark:bg-[#0d1117] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-3">
            <Crosshair className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Where to Hunt</h1>
          </div>
          <p className="text-earth-300 max-w-2xl">
            Find the best spots based on real bird activity, open seasons, and current weather conditions.
            Ranked by opportunity score — no guesswork.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Input Panel */}
        <div className="card p-6 mb-8">
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            {/* Species */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                Species
              </label>
              <select
                className="input w-full"
                value={selectedSpecies}
                onChange={e => setSelectedSpecies(e.target.value)}
              >
                <option value="">All Waterfowl</option>
                {speciesOptions.map(s => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                Hunt Date
              </label>
              <input
                type="date"
                className="input w-full"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
            </div>

            {/* Search button */}
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Crosshair className="w-4 h-4" />
                )}
                {loading ? 'Searching…' : 'Find Hunts'}
              </button>
            </div>
          </div>

          {/* State pills */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'rgb(var(--color-text-secondary))' }}>
              States
            </label>
            <div className="flex flex-wrap gap-2">
              {V1_STATES.map(code => {
                const active = selectedStates.has(code)
                return (
                  <button
                    key={code}
                    onClick={() => toggleState(code)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-accent-600 dark:bg-accent-700 text-white border-accent-600 dark:border-accent-700'
                        : 'border-earth-300 dark:border-earth-600 text-earth-600 dark:text-earth-400 hover:border-accent-400'
                    }`}
                  >
                    {code}
                  </button>
                )
              })}
              <button
                onClick={() => setSelectedStates(new Set(V1_STATES))}
                className="px-3 py-1.5 rounded-full text-xs border border-dashed text-earth-500 dark:text-earth-400 border-earth-300 dark:border-earth-600 hover:border-accent-400 transition-colors"
              >
                All
              </button>
            </div>
          </div>
        </div>

        {/* Scoring Legend */}
        <div className="flex flex-wrap gap-4 mb-6 text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
          <span className="font-medium" style={{ color: 'rgb(var(--color-text-secondary))' }}>Score factors:</span>
          <span>Bird trend <span className="font-medium">25 pts</span></span>
          <span>Count volume <span className="font-medium">20 pts</span></span>
          <span>Season open <span className="font-medium">20 pts</span></span>
          <span>Weather <span className="font-medium">15 pts</span></span>
          <span>Push factor <span className="font-medium">10 pts</span></span>
          <span>Migration status <span className="font-medium">10 pts</span></span>
          <span>Spike bonus <span className="font-medium">+5</span></span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-accent-500 mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                Analyzing bird counts, seasons, and weather…
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">Failed to load recommendations</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && hasSearched && results !== null && results.length === 0 && (
          <div className="text-center py-16">
            <Crosshair className="w-12 h-12 mx-auto mb-3" style={{ color: 'rgb(var(--color-text-tertiary))' }} />
            <p className="text-lg font-medium mb-2" style={{ color: 'rgb(var(--color-text-primary))' }}>
              No hunting locations found
            </p>
            <p className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
              Try expanding your state selection or choosing a different species.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && !error && results && results.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold" style={{ color: 'rgb(var(--color-text-primary))' }}>
                Top Locations
              </h2>
              <span className="text-sm" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                {results.length} of {totalLocations} locations
              </span>
            </div>

            <div className="space-y-4">
              {results.map(rec => (
                <div
                  key={rec.locationId}
                  className={`card p-5 ${rec.isAnomaly ? 'ring-1 ring-amber-400 dark:ring-amber-500' : ''}`}
                >
                  {/* Anomaly banner */}
                  {rec.isAnomaly && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">
                      <Zap className="w-3.5 h-3.5" />
                      Spike detected — numbers well above recent average
                    </div>
                  )}
                  {/* Header row */}
                  <div className="flex items-start gap-3 mb-3">
                    <RankBadge rank={rec.rank} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-base" style={{ color: 'rgb(var(--color-text-primary))' }}>
                            {rec.locationName}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-300 rounded px-2 py-0.5">
                              {rec.state}
                            </span>
                            {rec.flyway && (
                              <span className={`text-xs rounded px-2 py-0.5 ${FLYWAY_COLORS[rec.flyway] || 'bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-300'}`}>
                                {rec.flyway}
                              </span>
                            )}
                            {rec.migrationStatus && rec.migrationStatus !== 'no_data' && MIGRATION_STATUS_CONFIG[rec.migrationStatus].label && (
                              <span className={`text-xs rounded px-2 py-0.5 font-medium ${MIGRATION_STATUS_CONFIG[rec.migrationStatus].className}`}>
                                {MIGRATION_STATUS_CONFIG[rec.migrationStatus].label}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                              {rec.speciesName}
                            </span>
                          </div>
                        </div>
                        {rec.websiteUrl && (
                          <a
                            href={rec.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 text-accent-500 hover:text-accent-600 dark:hover:text-accent-400"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className="mb-4">
                    <ScoreBar score={rec.score} />
                  </div>

                  {/* Data grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {/* Bird count */}
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Birds Counted</p>
                      {rec.latestCount !== null ? (
                        <>
                          <p className="text-xl font-bold text-forest-600 dark:text-forest-400">
                            {rec.latestCount.toLocaleString()}
                          </p>
                          <TrendBadge trend={rec.trend} delta={rec.delta} deltaPercent={rec.deltaPercent} />
                          {rec.surveyDate && (
                            <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                              {new Date(rec.surveyDate).toLocaleDateString()}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm" style={{ color: 'rgb(var(--color-text-tertiary))' }}>No data</p>
                      )}
                    </div>

                    {/* Season status */}
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Season</p>
                      {rec.seasonOpen ? (
                        <div>
                          <div className="flex items-center gap-1 text-forest-600 dark:text-forest-400">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            <span className="font-semibold text-sm">Open</span>
                          </div>
                          {rec.seasonName && (
                            <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                              {rec.seasonName}
                            </p>
                          )}
                          {rec.seasonEnd && (
                            <p className="text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                              Closes {new Date(rec.seasonEnd).toLocaleDateString()}
                            </p>
                          )}
                          {bagLimitStr(rec.bagLimit) && (
                            <p className="text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                              Bag: {bagLimitStr(rec.bagLimit)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                          <XCircle className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm">Closed / No data</span>
                        </div>
                      )}
                    </div>

                    {/* Weather + Push */}
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Conditions</p>
                      {rec.weatherRating ? (
                        <div>
                          <p className={`font-semibold capitalize text-sm ${WEATHER_RATING_COLORS[rec.weatherRating] || ''}`}>
                            {rec.weatherRating}
                          </p>
                          {rec.temperature !== null && (
                            <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                              <Thermometer className="w-3 h-3" />
                              {rec.temperature}°{rec.temperatureUnit === 'F' ? 'F' : rec.temperatureUnit}
                            </div>
                          )}
                          {rec.windSpeed && (
                            <div className="flex items-center gap-1 text-xs" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                              <Wind className="w-3 h-3" />
                              {rec.windSpeed}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Unavailable</p>
                      )}
                      {/* Push factor indicator */}
                      {rec.pushScore > 0 && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Push</span>
                          <span className="flex gap-0.5">
                            {[1,2,3].map(n => (
                              <span key={n} className={`w-2 h-2 rounded-full ${n <= rec.pushScore ? 'bg-blue-500' : 'bg-earth-300 dark:bg-earth-600'}`} />
                            ))}
                          </span>
                          {rec.coldFrontPresent && (
                            <Wind className="w-3 h-3 text-blue-500 ml-0.5" />
                          )}
                        </div>
                      )}
                      {rec.coldFrontIncoming && !rec.coldFrontPresent && (
                        <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">Front incoming</p>
                      )}
                    </div>

                    {/* Score breakdown */}
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Score Breakdown</p>
                      <div className="space-y-0.5 text-xs" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                        <div className="flex justify-between">
                          <span>Trend</span>
                          <span className="font-medium">{rec.scoreBreakdown.trendScore}/25</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Volume</span>
                          <span className="font-medium">{rec.scoreBreakdown.magnitudeScore}/20</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Season</span>
                          <span className="font-medium">{rec.scoreBreakdown.seasonScore}/20</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Weather</span>
                          <span className="font-medium">{rec.scoreBreakdown.weatherScore}/15</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Push</span>
                          <span className="font-medium">{rec.scoreBreakdown.pushScore}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Migration</span>
                          <span className="font-medium">{rec.scoreBreakdown.migrationScore}/10</span>
                        </div>
                        {rec.scoreBreakdown.anomalyBonus > 0 && (
                          <div className="flex justify-between text-amber-600 dark:text-amber-400">
                            <span className="flex items-center gap-0.5"><Zap className="w-3 h-3" />Spike</span>
                            <span className="font-medium">+{rec.scoreBreakdown.anomalyBonus}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pre-search CTA */}
        {!hasSearched && !loading && (
          <div className="text-center py-16">
            <Crosshair className="w-12 h-12 mx-auto mb-4 text-accent-500" />
            <p className="text-lg font-medium mb-2" style={{ color: 'rgb(var(--color-text-primary))' }}>
              Ready to find your next hunt?
            </p>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'rgb(var(--color-text-secondary))' }}>
              Select your species, target date, and states above — then hit "Find Hunts" to see
              locations ranked by bird activity, open seasons, and weather.
            </p>
            <button onClick={handleSearch} className="btn-primary">
              Find Hunts Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
