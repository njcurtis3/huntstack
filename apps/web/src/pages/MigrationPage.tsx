import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Loader2, AlertCircle, Bird, X, TrendingUp, TrendingDown, Minus, Sparkles,
  Wind, Thermometer, Zap, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { api } from '../lib/api'
import { useThemeStore } from '../stores/themeStore'
import { getMapColors, getChartColors } from '../lib/themeColors'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

const STATE_NAME_TO_CODE: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
}

const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name])
)

// ─── Types ────────────────────────────────────────────────────────────────────

type CurrentCount = {
  refugeId: string
  refugeName: string
  state: string
  species: string
  speciesName: string
  count: number
  surveyDate: string
  surveyType: string
  centerPoint: { lat: number; lng: number } | null
  flyway: string | null
  previousCount: number | null
  previousDate: string | null
  delta: number | null
  deltaPercent: number | null
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
}

type HistoricalTrend = {
  year: number
  state_code: string
  species_slug: string
  total_count: number
}

type SpeciesOption = { slug: string; name: string }

type RefugeCount = {
  surveyDate: string
  count: number
  surveyType: string
  speciesSlug: string
  speciesName: string
  sourceUrl: string | null
  observers: string | null
  notes: string | null
  previousCount: number | null
  previousDate: string | null
  delta: number | null
  deltaPercent: number | null
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
}

type PushFactor = {
  stateCode: string
  pushScore: number
  coldFrontPresent: boolean
  coldFrontIncoming: boolean
  windDirection: string | null
  windIsFromNorth: boolean
  temperature: number | null
  temperatureUnit: string | null
  activeAlerts: Array<{ event: string; severity: string; headline: string | null }>
}

// ─── Migration status classification ─────────────────────────────────────────

type MigrationStatus =
  | 'arriving'
  | 'building'
  | 'peak'
  | 'declining'
  | 'departing'
  | 'first_survey'
  | null

function getMigrationStatus(
  trend: 'increasing' | 'decreasing' | 'stable' | 'new',
  deltaPercent: number | null,
): MigrationStatus {
  if (trend === 'new') return 'first_survey'
  if (trend === 'increasing') {
    return (deltaPercent !== null && deltaPercent > 20) ? 'arriving' : 'building'
  }
  if (trend === 'stable') return 'peak'
  if (trend === 'decreasing') {
    return (deltaPercent !== null && deltaPercent < -20) ? 'departing' : 'declining'
  }
  return null
}

const STATUS_CONFIG: Record<NonNullable<MigrationStatus>, { label: string; className: string }> = {
  arriving:     { label: 'Arriving',     className: 'bg-forest-100 dark:bg-forest-900/30 text-forest-700 dark:text-forest-300' },
  building:     { label: 'Building',     className: 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300' },
  peak:         { label: 'Peak',         className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  declining:    { label: 'Declining',    className: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
  departing:    { label: 'Departing',    className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  first_survey: { label: 'New Data',     className: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
}

// ─── Anomaly detection ────────────────────────────────────────────────────────

type AnomalyType = 'spike' | 'drop' | null

function getAnomaly(count: number, deltaPercent: number | null, previousCount: number | null): AnomalyType {
  if (deltaPercent === null || previousCount === null) return null
  if (deltaPercent >= 30 && count >= 500) return 'spike'
  if (deltaPercent <= -40 && previousCount >= 500) return 'drop'
  return null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FLYWAY_OPTIONS = [
  { value: '', label: 'All Flyways' },
  { value: 'central', label: 'Central Flyway' },
  { value: 'mississippi', label: 'Mississippi Flyway' },
  { value: 'pacific', label: 'Pacific Flyway' },
  { value: 'atlantic', label: 'Atlantic Flyway' },
]

const FLYWAY_COLORS: Record<string, string> = {
  central: 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300',
  mississippi: 'bg-forest-100 dark:bg-forest-900/30 text-forest-700 dark:text-forest-300',
  pacific: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  atlantic: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
}

const STATE_LINE_COLORS = ['#1f883d', '#0969da', '#cf222e', '#bf8700', '#8250df', '#bf3989', '#0550ae']

const PUSH_SCORE_LABELS = ['Low', 'Moderate', 'High', 'Extreme']
const PUSH_SCORE_COLORS = [
  'text-earth-500 dark:text-earth-400',
  'text-amber-600 dark:text-amber-400',
  'text-orange-600 dark:text-orange-400',
  'text-red-600 dark:text-red-400',
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function DeltaBadge({ trend, delta, deltaPercent }: {
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
  delta: number | null
  deltaPercent: number | null
}) {
  if (trend === 'new') {
    return (
      <span className="flex items-center gap-1 text-xs text-accent-500 dark:text-accent-400">
        <Sparkles className="w-3 h-3" />
        First survey
      </span>
    )
  }

  const formattedDelta = delta !== null
    ? `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`
    : null
  const formattedPct = deltaPercent !== null
    ? ` (${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(1)}%)`
    : ''

  if (trend === 'stable') {
    return (
      <span className="flex items-center gap-1 text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        <Minus className="w-3 h-3" />
        {formattedDelta}{formattedPct}
      </span>
    )
  }

  if (trend === 'increasing') {
    return (
      <span className="flex items-center gap-1 text-xs text-forest-600 dark:text-forest-400">
        <TrendingUp className="w-3 h-3" />
        {formattedDelta}{formattedPct}
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: '#cf222e' }}>
      <TrendingDown className="w-3 h-3" />
      {formattedDelta}{formattedPct}
    </span>
  )
}

function WeatherAlertsPanel({ alerts }: {
  alerts: Array<{ id: string; event: string; headline: string | null; severity: string; areaDesc: string; expires: string }>
}) {
  const [expanded, setExpanded] = useState(false)

  const severeCount = alerts.filter(a => a.severity === 'Extreme' || a.severity === 'Severe').length
  const hasSevere = severeCount > 0

  return (
    <div className={`card p-4 mb-6 ${hasSevere ? 'border-red-300 dark:border-red-800' : 'border-amber-300 dark:border-amber-800'}`}>
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <AlertCircle className={`w-5 h-5 ${hasSevere ? 'text-red-500' : 'text-amber-500'}`} />
          <div className="text-left">
            <h2 className="text-sm font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
              Weather Alerts
            </h2>
            <p className={`text-xs font-medium ${hasSevere ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
              {severeCount > 0 && ` · ${severeCount} severe`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Severity dots */}
          <div className="flex gap-1">
            {alerts.slice(0, 3).map(a => (
              <span
                key={a.id}
                className={`w-2 h-2 rounded-full ${
                  a.severity === 'Extreme' || a.severity === 'Severe'
                    ? 'bg-red-500'
                    : 'bg-amber-400'
                }`}
              />
            ))}
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4" style={{ color: `rgb(var(--color-text-tertiary))` }} />
            : <ChevronDown className="w-4 h-4" style={{ color: `rgb(var(--color-text-tertiary))` }} />
          }
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-md text-sm border ${
                alert.severity === 'Extreme' || alert.severity === 'Severe'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              }`}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <span className="font-medium">{alert.event}</span>
                {alert.headline && <span className="ml-1">{alert.headline}</span>}
                <p className="text-xs opacity-75 mt-0.5">{alert.areaDesc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PushFactorsPanel({ pushFactors, overallPushScore, states }: {
  pushFactors: PushFactor[]
  overallPushScore: number
  states: string[]
}) {
  const [expanded, setExpanded] = useState(false)

  // Only show states that have any push signal or alerts
  const activePush = pushFactors.filter(
    f => f.pushScore > 0 || f.activeAlerts.length > 0
  )

  // Aggregate signals across all states
  const anyColdFront = pushFactors.some(f => f.coldFrontPresent)
  const anyColdFrontIncoming = pushFactors.some(f => f.coldFrontIncoming)
  const anyNorthWind = pushFactors.some(f => f.windIsFromNorth)
  const anySubFreezing = pushFactors.some(f => f.temperature !== null && f.temperature < 32)

  const scoreLabel = PUSH_SCORE_LABELS[Math.min(overallPushScore, 3)]
  const scoreColor = PUSH_SCORE_COLORS[Math.min(overallPushScore, 3)]

  return (
    <div className="card p-4 mb-6">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <Wind className="w-5 h-5 text-accent-500" />
          <div className="text-left">
            <h2 className="text-sm font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
              Migration Pressure
            </h2>
            <p className={`text-xs font-medium ${scoreColor}`}>
              {scoreLabel}
              {overallPushScore === 0 && ' — calm conditions'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Push score dots */}
          <div className="flex gap-1">
            {[1, 2, 3].map(i => (
              <span
                key={i}
                className={`w-2.5 h-2.5 rounded-full ${
                  overallPushScore >= i
                    ? i === 3 ? 'bg-red-500' : i === 2 ? 'bg-orange-400' : 'bg-amber-400'
                    : 'bg-earth-200 dark:bg-earth-700'
                }`}
              />
            ))}
          </div>
          {expanded ? <ChevronUp className="w-4 h-4" style={{ color: `rgb(var(--color-text-tertiary))` }} /> : <ChevronDown className="w-4 h-4" style={{ color: `rgb(var(--color-text-tertiary))` }} />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
          {/* Aggregate checklist */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { active: anyColdFront, label: 'Cold front present', icon: '🌬️' },
              { active: anyColdFrontIncoming, label: 'Front incoming (48h)', icon: '📉' },
              { active: anyNorthWind, label: 'North winds', icon: '🧭' },
              { active: anySubFreezing, label: 'Sub-freezing temps', icon: '🧊' },
            ].map(item => (
              <div
                key={item.label}
                className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 ${
                  item.active
                    ? 'bg-forest-50 dark:bg-forest-900/20 text-forest-700 dark:text-forest-300'
                    : 'bg-earth-50 dark:bg-earth-800/50 text-earth-400 dark:text-earth-500'
                }`}
              >
                <span>{item.icon}</span>
                <span className={item.active ? 'font-medium' : ''}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Per-state breakdown */}
          {activePush.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                Active signals by state
              </p>
              <div className="flex flex-wrap gap-2">
                {activePush.map(f => (
                  <div
                    key={f.stateCode}
                    className="flex items-center gap-1.5 text-xs rounded px-2 py-1 border"
                    style={{ borderColor: `rgb(var(--color-border-primary))`, color: `rgb(var(--color-text-secondary))` }}
                  >
                    <span className="font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
                      {f.stateCode}
                    </span>
                    {f.coldFrontPresent && <span title="Cold front present">🌬️</span>}
                    {f.coldFrontIncoming && <span title="Cold front incoming">📉</span>}
                    {f.windIsFromNorth && <span title="North wind">{f.windDirection}</span>}
                    {f.temperature !== null && (
                      <span style={{ color: `rgb(var(--color-text-tertiary))` }}>
                        {f.temperature}°{f.temperatureUnit ?? 'F'}
                      </span>
                    )}
                    {/* Score dots */}
                    <div className="flex gap-0.5">
                      {[1, 2, 3].map(i => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${
                            f.pushScore >= i ? 'bg-amber-400' : 'bg-earth-200 dark:bg-earth-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePush.length === 0 && (
            <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
              No strong push signals detected across {states.join(', ')}. Birds likely holding.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MigrationPage() {
  const [selectedFlyway, setSelectedFlyway] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState('')
  const [selectedState, setSelectedState] = useState('')

  const [currentCounts, setCurrentCounts] = useState<CurrentCount[]>([])
  const [historicalTrends, setHistoricalTrends] = useState<HistoricalTrend[]>([])
  const [speciesOptions, setSpeciesOptions] = useState<SpeciesOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedRefuge, setSelectedRefuge] = useState<{ id: string; name: string } | null>(null)
  const [refugeDetail, setRefugeDetail] = useState<RefugeCount[]>([])
  const [refugeDetailLoading, setRefugeDetailLoading] = useState(false)

  const [weatherAlerts, setWeatherAlerts] = useState<Array<{
    id: string; event: string; headline: string | null
    severity: string; areaDesc: string; expires: string
  }>>([])
  const [pushFactorsData, setPushFactorsData] = useState<{
    pushFactors: PushFactor[]
    overallPushScore: number
  } | null>(null)

  const [refugeWeather, setRefugeWeather] = useState<Map<string, {
    temperature: number; temperatureUnit: string
    windSpeed: string; windDirection: string
    conditions: string; huntingRating: 'excellent' | 'good' | 'fair' | 'poor'
  }>>(new Map())
  const weatherRequestedRef = useRef<Set<string>>(new Set())

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const mapColors = getMapColors(resolvedTheme)
  const chartColors = getChartColors(resolvedTheme)

  // Fetch dashboard data
  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const [dashboardData, speciesData] = await Promise.all([
          api.getMigrationDashboard({
            flyway: selectedFlyway || undefined,
            species: selectedSpecies || undefined,
          }),
          api.getSpecies({ category: 'waterfowl' }),
        ])
        if (cancelled) return
        setCurrentCounts(dashboardData.currentCounts)
        setHistoricalTrends(dashboardData.historicalTrends)
        setSpeciesOptions(speciesData.species.map(s => ({ slug: s.slug, name: s.name })))
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load migration data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [selectedFlyway, selectedSpecies])

  // Fetch refuge detail on click
  const handleRefugeClick = async (refugeId: string, refugeName: string) => {
    if (selectedRefuge?.id === refugeId) {
      setSelectedRefuge(null)
      return
    }
    setSelectedRefuge({ id: refugeId, name: refugeName })
    setRefugeDetailLoading(true)
    try {
      const data = await api.getRefugeCounts(refugeId, {
        species: selectedSpecies || undefined,
        limit: 100,
      })
      setRefugeDetail(data.counts)
    } catch {
      setRefugeDetail([])
    } finally {
      setRefugeDetailLoading(false)
    }
  }

  // Derive states from data
  const statesWithData = useMemo(() => new Set(currentCounts.map(c => c.state)), [currentCounts])
  const stateOptions = useMemo(() => [...statesWithData].sort(), [statesWithData])

  // Fetch weather alerts + push factors together once states are known
  useEffect(() => {
    let cancelled = false
    const statesParam = stateOptions.length > 0 ? stateOptions.join(',') : 'TX,NM,AR,LA,KS,OK,MO'

    async function fetchWeatherIntel() {
      try {
        const [alertsData, pushData] = await Promise.all([
          api.getWeatherAlerts(statesParam),
          api.getMigrationPushFactors(statesParam),
        ])
        if (cancelled) return
        const relevant = alertsData.alerts.filter(a =>
          ['Severe', 'Extreme', 'Moderate'].includes(a.severity)
        )
        setWeatherAlerts(relevant.slice(0, 5))
        setPushFactorsData({
          pushFactors: pushData.pushFactors,
          overallPushScore: pushData.overallPushScore,
        })
      } catch {
        // Silently fail — enhancement only
      }
    }
    fetchWeatherIntel()
    return () => { cancelled = true }
  }, [stateOptions])

  // Map click handler
  const handleMapStateClick = useCallback((stateCode: string) => {
    setSelectedState(prev => prev === stateCode ? '' : stateCode)
  }, [])

  // Filter cards by selected state
  const filteredCounts = useMemo(() => {
    if (!selectedState) return currentCounts
    return currentCounts.filter(c => c.state === selectedState)
  }, [currentCounts, selectedState])

  // Enrich counts with migration status + anomaly
  const enrichedCounts = useMemo(() => {
    return filteredCounts.map(item => ({
      ...item,
      migrationStatus: getMigrationStatus(item.trend, item.deltaPercent),
      anomaly: getAnomaly(item.count, item.deltaPercent, item.previousCount),
    }))
  }, [filteredCounts])

  // Sort: anomalies first, then by count descending
  const sortedCounts = useMemo(() => {
    return [...enrichedCounts].sort((a, b) => {
      const aIsAnomaly = a.anomaly !== null ? 1 : 0
      const bIsAnomaly = b.anomaly !== null ? 1 : 0
      if (bIsAnomaly !== aIsAnomaly) return bIsAnomaly - aIsAnomaly
      return b.count - a.count
    })
  }, [enrichedCounts])

  // Fetch weather for visible refuges (staggered)
  useEffect(() => {
    let cancelled = false
    const uniqueRefuges = [...new Set(filteredCounts.map(c => c.refugeId))]
    const toFetch = uniqueRefuges
      .filter(id => !weatherRequestedRef.current.has(id))
      .slice(0, 6)

    if (toFetch.length === 0) return
    toFetch.forEach(id => weatherRequestedRef.current.add(id))

    async function fetchWeather() {
      for (const refugeId of toFetch) {
        if (cancelled) return
        try {
          const data = await api.getHuntingConditions(refugeId)
          if (cancelled) return
          setRefugeWeather(prev => {
            const next = new Map(prev)
            next.set(refugeId, {
              temperature: data.conditions.temperature,
              temperatureUnit: data.conditions.temperatureUnit,
              windSpeed: data.conditions.windSpeed,
              windDirection: data.conditions.windDirection,
              conditions: data.conditions.conditions,
              huntingRating: data.conditions.huntingRating,
            })
            return next
          })
        } catch {
          weatherRequestedRef.current.delete(refugeId)
        }
        await new Promise(r => setTimeout(r, 200))
      }
    }
    fetchWeather()
    return () => { cancelled = true }
  }, [filteredCounts])

  // Summary stats
  const totalBirds = filteredCounts.reduce((sum, c) => sum + (c.count || 0), 0)
  const refugeCount = new Set(filteredCounts.map(c => c.refugeName)).size
  const latestDate = filteredCounts.length > 0
    ? new Date(Math.max(...filteredCounts.map(c => new Date(c.surveyDate).getTime())))
    : null
  const anomalyCount = enrichedCounts.filter(c => c.anomaly !== null).length

  // Historical chart data
  const chartData = useMemo(() => {
    const byYear: Record<number, Record<string, number>> = {}
    historicalTrends.forEach(t => {
      if (!byYear[t.year]) byYear[t.year] = { year: t.year }
      byYear[t.year][t.state_code] = (byYear[t.year][t.state_code] || 0) + t.total_count
    })
    return Object.values(byYear).sort((a, b) => (a.year as number) - (b.year as number))
  }, [historicalTrends])

  const stateKeys = useMemo(() => {
    return [...new Set(historicalTrends.map(t => t.state_code))]
  }, [historicalTrends])

  const refugeChartData = useMemo(() => [...refugeDetail].reverse(), [refugeDetail])

  return (
    <div>
      {/* Header */}
      <div className="bg-earth-900 dark:bg-[#0d1117] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-3">
            <Bird className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Migration</h1>
            <span className="text-xs bg-accent-600 dark:bg-accent-700 rounded-full px-3 py-1 font-medium">Beta</span>
          </div>
          <p className="text-earth-300 max-w-2xl">
            Track waterfowl movement across refuges and flyways. See the latest survey counts,
            spot migration trends, and plan your hunts around real bird activity.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Limited data notice */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md px-4 py-3 mb-6 text-sm text-yellow-800 dark:text-yellow-200">
          Refuge count data is currently limited to select states and sources. We're actively working to expand coverage across more refuges and flyways.
        </div>

        {/* Weather Alerts — collapsible */}
        {weatherAlerts.length > 0 && <WeatherAlertsPanel alerts={weatherAlerts} />}

        {/* Push Factors Panel */}
        {pushFactorsData && (
          <PushFactorsPanel
            pushFactors={pushFactorsData.pushFactors}
            overallPushScore={pushFactorsData.overallPushScore}
            states={stateOptions.length > 0 ? stateOptions : ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO']}
          />
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <select
            className="input max-w-xs"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
          >
            <option value="">All States</option>
            {stateOptions.map(s => (
              <option key={s} value={s}>{STATE_CODE_TO_NAME[s] || s} ({s})</option>
            ))}
          </select>
          <select
            className="input max-w-xs"
            value={selectedSpecies}
            onChange={(e) => setSelectedSpecies(e.target.value)}
          >
            <option value="">All Species</option>
            {speciesOptions.map(s => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <select
            className="input max-w-xs"
            value={selectedFlyway}
            onChange={(e) => setSelectedFlyway(e.target.value)}
          >
            {FLYWAY_OPTIONS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* US State Map */}
        <div className="card p-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>
              Select a state {selectedState && (
                <button
                  onClick={() => setSelectedState('')}
                  className="ml-2 text-xs text-accent-500 hover:text-accent-600 dark:hover:text-accent-400 underline"
                >
                  Clear selection
                </button>
              )}
            </h2>
            <div className="flex items-center gap-4 text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-forest-200 dark:bg-forest-800 inline-block" /> Has data
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-accent-500 inline-block" /> Selected
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block border" style={{ backgroundColor: `rgb(var(--color-bg-secondary))`, borderColor: `rgb(var(--color-border-primary))` }} /> No data
              </span>
            </div>
          </div>
          <ComposableMap
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1000 }}
            width={980}
            height={500}
            style={{ width: '100%', height: 'auto' }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const stateName = geo.properties.name as string
                  const stateCode = STATE_NAME_TO_CODE[stateName]
                  if (!stateCode) return null
                  const hasData = statesWithData.has(stateCode)
                  const isSelected = selectedState === stateCode
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => hasData && handleMapStateClick(stateCode)}
                      style={{
                        default: {
                          fill: isSelected ? mapColors.selected : hasData ? mapColors.hasData : mapColors.empty,
                          stroke: mapColors.stroke,
                          strokeWidth: 0.5,
                          outline: 'none',
                          cursor: hasData ? 'pointer' : 'default',
                        },
                        hover: {
                          fill: isSelected ? mapColors.selectedHover : hasData ? mapColors.hasDataHover : mapColors.empty,
                          stroke: hasData ? mapColors.selected : mapColors.stroke,
                          strokeWidth: hasData ? 1.5 : 0.5,
                          outline: 'none',
                          cursor: hasData ? 'pointer' : 'default',
                        },
                        pressed: {
                          fill: isSelected ? mapColors.selectedHover : hasData ? mapColors.hasDataHover : mapColors.empty,
                          stroke: mapColors.selected,
                          strokeWidth: 1.5,
                          outline: 'none',
                        },
                      }}
                    />
                  )
                })
              }
            </Geographies>
          </ComposableMap>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">Failed to load migration data</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="card p-4">
                <p className="text-sm" style={{ color: `rgb(var(--color-text-tertiary))` }}>Total Birds Counted</p>
                <p className="text-2xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>{totalBirds.toLocaleString()}</p>
              </div>
              <div className="card p-4">
                <p className="text-sm" style={{ color: `rgb(var(--color-text-tertiary))` }}>Refuges Reporting</p>
                <p className="text-2xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>{refugeCount}</p>
              </div>
              <div className="card p-4">
                <p className="text-sm" style={{ color: `rgb(var(--color-text-tertiary))` }}>Latest Survey</p>
                <p className="text-2xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
                  {latestDate ? latestDate.toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-sm" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                  {anomalyCount > 0 ? 'Anomalies Detected' : 'Trending Up'}
                </p>
                {anomalyCount > 0 ? (
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    {anomalyCount}
                    <span className="text-sm font-normal" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                      refuges
                    </span>
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-forest-600 dark:text-forest-400 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    {filteredCounts.filter(c => c.trend === 'increasing').length}
                    <span className="text-sm font-normal" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                      / {filteredCounts.filter(c => c.trend !== 'new').length}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Current Counts */}
            {sortedCounts.length > 0 ? (
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>
                  Latest Refuge Counts
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedCounts.map((item, i) => {
                    const isSpike = item.anomaly === 'spike'
                    const isDrop = item.anomaly === 'drop'
                    const statusCfg = item.migrationStatus ? STATUS_CONFIG[item.migrationStatus] : null

                    return (
                      <button
                        key={`${item.refugeId}-${item.species}-${i}`}
                        onClick={() => handleRefugeClick(item.refugeId, item.refugeName)}
                        className={`card p-5 text-left hover:border-accent-400 dark:hover:border-accent-500 transition-colors w-full ${
                          selectedRefuge?.id === item.refugeId ? 'ring-2 ring-accent-500' : ''
                        } ${isSpike ? 'ring-2 ring-amber-400 dark:ring-amber-500' : ''} ${
                          isDrop ? 'ring-2 ring-red-400 dark:ring-red-500' : ''
                        }`}
                      >
                        {/* Anomaly banner */}
                        {isSpike && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-t-md -mx-5 -mt-5 px-5 py-1.5 mb-3">
                            <Zap className="w-3 h-3" />
                            Spike detected — {item.deltaPercent !== null ? `+${item.deltaPercent.toFixed(0)}%` : ''} this survey
                          </div>
                        )}
                        {isDrop && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-t-md -mx-5 -mt-5 px-5 py-1.5 mb-3">
                            <AlertTriangle className="w-3 h-3" />
                            Sharp decline — {item.deltaPercent !== null ? `${item.deltaPercent.toFixed(0)}%` : ''} this survey
                          </div>
                        )}

                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold truncate pr-2" style={{ color: `rgb(var(--color-text-primary))` }}>
                            {item.refugeName}
                          </h3>
                          <span className="text-xs bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-300 rounded px-2 py-0.5 flex-shrink-0">
                            {item.state}
                          </span>
                        </div>

                        {/* Species + migration status */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <p className="text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
                            {item.speciesName}
                          </p>
                          {statusCfg && (
                            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${statusCfg.className}`}>
                              {statusCfg.label}
                            </span>
                          )}
                        </div>

                        <p className="text-3xl font-bold text-forest-600 dark:text-forest-400">{item.count.toLocaleString()}</p>
                        <div className="mt-1">
                          <DeltaBadge trend={item.trend} delta={item.delta} deltaPercent={item.deltaPercent} />
                        </div>

                        {/* Weather inline */}
                        {refugeWeather.has(item.refugeId) && (() => {
                          const w = refugeWeather.get(item.refugeId)!
                          const ratingColors: Record<string, string> = {
                            excellent: 'text-forest-600 dark:text-forest-400',
                            good: 'text-accent-600 dark:text-accent-400',
                            fair: 'text-amber-600 dark:text-amber-400',
                            poor: 'text-red-600 dark:text-red-400',
                          }
                          return (
                            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                              <Thermometer className="w-3 h-3" />
                              <span>{w.temperature}°{w.temperatureUnit === 'F' ? 'F' : w.temperatureUnit}</span>
                              <span>·</span>
                              <Wind className="w-3 h-3" />
                              <span>{w.windSpeed} {w.windDirection}</span>
                              <span>·</span>
                              <span className={ratingColors[w.huntingRating] || ''}>{w.huntingRating}</span>
                            </div>
                          )
                        })()}

                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                            {new Date(item.surveyDate).toLocaleDateString()}
                          </span>
                          {item.flyway && (
                            <span className={`text-xs rounded px-2 py-0.5 ${FLYWAY_COLORS[item.flyway] || 'bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-300'}`}>
                              {item.flyway}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 mb-8">
                <Bird className="w-12 h-12 mx-auto mb-3" style={{ color: `rgb(var(--color-text-tertiary))` }} />
                <p style={{ color: `rgb(var(--color-text-secondary))` }}>No migration data available for these filters.</p>
              </div>
            )}

            {/* Refuge Detail Panel */}
            {selectedRefuge && (
              <div className="card p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
                    {selectedRefuge.name} — Count History
                  </h2>
                  <button
                    onClick={() => setSelectedRefuge(null)}
                    className="text-earth-400 hover:text-earth-600 dark:hover:text-earth-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {refugeDetailLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-accent-500" />
                  </div>
                ) : refugeDetail.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={refugeChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                        <XAxis
                          dataKey="surveyDate"
                          tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          stroke={chartColors.axis}
                        />
                        <YAxis
                          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                          stroke={chartColors.axis}
                        />
                        <Tooltip
                          labelFormatter={(d) => new Date(d as string).toLocaleDateString()}
                          formatter={(value) => [(value as number).toLocaleString(), 'Count']}
                          contentStyle={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.tooltipText }}
                        />
                        <Line type="monotone" dataKey="count" stroke="#1f883d" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
                          <tr>
                            <th className="text-left p-3 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Date</th>
                            <th className="text-left p-3 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Species</th>
                            <th className="text-right p-3 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Count</th>
                            <th className="text-right p-3 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Change</th>
                            <th className="text-left p-3 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
                          {refugeDetail.map((row, i) => {
                            const status = getMigrationStatus(row.trend, row.deltaPercent)
                            const statusCfg = status ? STATUS_CONFIG[status] : null
                            return (
                              <tr key={i}>
                                <td className="p-3">{new Date(row.surveyDate).toLocaleDateString()}</td>
                                <td className="p-3">{row.speciesName}</td>
                                <td className="p-3 text-right font-medium">{row.count.toLocaleString()}</td>
                                <td className="p-3 text-right">
                                  <div className="flex justify-end">
                                    <DeltaBadge trend={row.trend} delta={row.delta} deltaPercent={row.deltaPercent} />
                                  </div>
                                </td>
                                <td className="p-3">
                                  {statusCfg ? (
                                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${statusCfg.className}`}>
                                      {statusCfg.label}
                                    </span>
                                  ) : (
                                    <span style={{ color: `rgb(var(--color-text-tertiary))` }}>{row.surveyType}</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-center py-4" style={{ color: `rgb(var(--color-text-secondary))` }}>
                    No count data available for this refuge.
                  </p>
                )}
              </div>
            )}

            {/* Historical Trends Chart */}
            {chartData.length > 0 && (
              <div className="card p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>Historical Trends</h2>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis dataKey="year" stroke={chartColors.axis} />
                    <YAxis
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                      stroke={chartColors.axis}
                    />
                    <Tooltip
                      formatter={(value) => (value as number).toLocaleString()}
                      contentStyle={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.tooltipText }}
                    />
                    <Legend />
                    {stateKeys.map((state, i) => (
                      <Line
                        key={state}
                        type="monotone"
                        dataKey={state}
                        stroke={STATE_LINE_COLORS[i % STATE_LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name={state}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs mt-3" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                  Historical data from Midwinter Waterfowl Inventory (2006–2016).
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
