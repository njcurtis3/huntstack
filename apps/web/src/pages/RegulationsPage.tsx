import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, FileText, AlertCircle, ExternalLink, Loader2, MessageSquare, X } from 'lucide-react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { api } from '../lib/api'
import { useThemeStore } from '../stores/themeStore'
import { getMapColors } from '../lib/themeColors'

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

type StateInfo = {
  code: string
  name: string
  agencyName: string | null
  agencyUrl: string | null
  regulationsUrl: string | null
  licenseUrl: string | null
  lastScraped: string | null
}

type Regulation = {
  id: string
  category: string
  title: string
  content: string
  summary: string | null
  seasonYear: number | null
  sourceUrl: string | null
  metadata: unknown
}

type Season = {
  id: string
  name: string
  seasonType: string | null
  startDate: string
  endDate: string
  year: number
  bagLimit: unknown
  shootingHours: unknown
  restrictions: string | null
}

type License = {
  id: string
  name: string
  licenseType: string
  description: string | null
  isResidentOnly: boolean | null
  priceResident: number | null
  priceNonResident: number | null
  purchaseUrl: string | null
}

// ─── Compare helpers ─────────────────────────────────────────────────────────

type StateCompareData = {
  seasons: Season[]
  licenses: License[]
  loading: boolean
  error: string | null
}

type CompareRow = {
  label: string
  values: Record<string, string>
  differs: boolean
}

function getDuckSeason(seasons: Season[]): Season | null {
  return seasons.find(s => {
    const n = `${s.name} ${s.seasonType || ''}`.toLowerCase()
    return n.includes('duck') || n.includes('waterfowl') || n.includes('mallard')
  }) || null
}

function getSnowGooseSeason(seasons: Season[]): Season | null {
  return seasons.find(s => {
    const n = `${s.name} ${s.seasonType || ''}`.toLowerCase()
    return n.includes('snow') || n.includes('light goose') || n.includes('conservation order')
  }) || null
}

function findLicense(licenses: License[], keywords: string[]): License | null {
  return licenses.find(l => {
    const n = `${l.name} ${l.licenseType || ''} ${l.description || ''}`.toLowerCase()
    return keywords.every(kw => n.includes(kw.toLowerCase()))
  }) || null
}

function formatDateRange(season: Season | null): string {
  if (!season) return '—'
  const start = new Date(season.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const end = new Date(season.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${start} – ${end}`
}

function formatShootingHours(hours: unknown): string {
  if (!hours) return '—'
  if (typeof hours === 'string') return hours
  if (typeof hours === 'object' && hours !== null) {
    const h = hours as Record<string, unknown>
    if (h.start && h.end) return `${h.start} – ${h.end}`
    if (h.description) return String(h.description)
    if (h.text) return String(h.text)
  }
  return '—'
}

function buildCompareRows(stateCodes: string[], dataMap: Record<string, StateCompareData>): CompareRow[] {
  function makeRow(label: string, getValue: (code: string) => string): CompareRow {
    const values: Record<string, string> = {}
    for (const code of stateCodes) {
      const d = dataMap[code]
      values[code] = !d || d.loading ? '…' : d.error ? 'Error' : getValue(code)
    }
    const settled = Object.values(values).filter(v => v !== '…' && v !== 'Error' && v !== '—')
    return { label, values, differs: new Set(settled).size > 1 }
  }

  return [
    makeRow('Duck Season', code => formatDateRange(getDuckSeason(dataMap[code]?.seasons || []))),
    makeRow('Daily Bag Limit', code => {
      const season = getDuckSeason(dataMap[code]?.seasons || [])
      const bl = season?.bagLimit as { daily?: number } | null
      return bl?.daily != null ? `${bl.daily}/day` : '—'
    }),
    makeRow('Shooting Hours', code => formatShootingHours(getDuckSeason(dataMap[code]?.seasons || [])?.shootingHours)),
    makeRow('Snow/Light Goose Season', code => formatDateRange(getSnowGooseSeason(dataMap[code]?.seasons || []))),
    makeRow('Resident License', code => {
      const lic = findLicense(dataMap[code]?.licenses || [], ['hunting'])
        || findLicense(dataMap[code]?.licenses || [], ['resident'])
      return lic?.priceResident != null ? `$${lic.priceResident.toFixed(2)}` : '—'
    }),
    makeRow('Non-Resident License', code => {
      const lic = findLicense(dataMap[code]?.licenses || [], ['hunting'])
        || findLicense(dataMap[code]?.licenses || [], ['non-resident'])
      return lic?.priceNonResident != null ? `$${lic.priceNonResident.toFixed(2)}` : '—'
    }),
    makeRow('Federal Duck Stamp', code => {
      const lic = findLicense(dataMap[code]?.licenses || [], ['duck', 'stamp'])
        || findLicense(dataMap[code]?.licenses || [], ['federal', 'stamp'])
      return lic?.priceResident != null ? `$${lic.priceResident.toFixed(2)}` : '—'
    }),
    makeRow('State Waterfowl Stamp', code => {
      const lic = findLicense(dataMap[code]?.licenses || [], ['state', 'waterfowl'])
        || findLicense(dataMap[code]?.licenses || [], ['state', 'duck'])
      return lic?.priceResident != null ? `$${lic.priceResident.toFixed(2)}` : '—'
    }),
  ]
}

function CompareTable({ stateCodes, statesList }: { stateCodes: string[], statesList: StateInfo[] }) {
  const [dataMap, setDataMap] = useState<Record<string, StateCompareData>>({})
  const cacheKey = [...stateCodes].sort().join(',')

  useEffect(() => {
    stateCodes.forEach(code => {
      if (dataMap[code] && !dataMap[code].loading) return
      setDataMap(prev => ({ ...prev, [code]: { seasons: [], licenses: [], loading: true, error: null } }))
      Promise.all([
        api.getStateSeasons(code, { year: 2024 }),
        api.getStateLicenses(code),
      ]).then(([seasonsResp, licensesResp]) => {
        setDataMap(prev => ({
          ...prev,
          [code]: {
            seasons: seasonsResp.seasons as Season[],
            licenses: licensesResp.licenses as License[],
            loading: false,
            error: null,
          },
        }))
      }).catch(err => {
        setDataMap(prev => ({
          ...prev,
          [code]: { seasons: [], licenses: [], loading: false, error: err instanceof Error ? err.message : 'Failed' },
        }))
      })
    })
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => buildCompareRows(stateCodes, dataMap), [stateCodes, dataMap])
  const anyLoading = stateCodes.some(code => dataMap[code]?.loading)

  return (
    <div className="card overflow-hidden mb-8">
      <div
        className="px-5 py-4 flex items-center justify-between border-b"
        style={{ borderColor: `rgb(var(--color-border-primary))` }}
      >
        <h2 className="text-lg font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
          State Comparison
        </h2>
        {anyLoading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: `rgb(var(--color-text-tertiary))` }} />}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
            <tr>
              <th className="text-left p-4 font-medium" style={{ color: `rgb(var(--color-text-secondary))`, minWidth: '160px' }}></th>
              {stateCodes.map(code => {
                const info = statesList.find(s => s.code === code)
                return (
                  <th key={code} className="text-left p-4 font-medium" style={{ color: `rgb(var(--color-text-secondary))`, minWidth: '160px' }}>
                    <div className="flex items-center gap-1">
                      <span style={{ color: `rgb(var(--color-text-primary))` }}>{info?.name || code}</span>
                      {info?.agencyUrl && (
                        <a href={info.agencyUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:text-accent-600">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {info?.agencyName && (
                      <div className="text-xs font-normal mt-0.5" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                        {info.agencyName}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.label}
                className="border-t"
                style={{
                  borderColor: `rgb(var(--color-border-primary))`,
                  backgroundColor: row.differs ? `rgb(var(--color-bg-secondary))` : undefined,
                }}
              >
                <td className="p-4 text-xs font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>
                  <div className="flex items-center gap-1.5">
                    {row.differs && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Values differ" />
                    )}
                    {row.label}
                  </div>
                </td>
                {stateCodes.map(code => (
                  <td key={code} className="p-4" style={{ color: `rgb(var(--color-text-primary))` }}>
                    {dataMap[code]?.loading
                      ? <span style={{ color: `rgb(var(--color-text-tertiary))` }}>…</span>
                      : <span>{row.values[code]}</span>
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="px-5 py-3 text-xs flex items-center gap-2 border-t"
        style={{
          backgroundColor: `rgb(var(--color-bg-secondary))`,
          color: `rgb(var(--color-text-tertiary))`,
          borderColor: `rgb(var(--color-border-primary))`,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
        Highlighted rows have differing values across states
      </div>
    </div>
  )
}

// ─── State detail view (single state) ────────────────────────────────────────

function StateDetailView({ stateCode }: { stateCode: string }) {
  const navigate = useNavigate()
  const [stateInfo, setStateInfo] = useState<StateInfo | null>(null)
  const [regs, setRegs] = useState<Regulation[]>([])
  const [seasonsList, setSeasonsList] = useState<Season[]>([])
  const [licensesList, setLicensesList] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedYear, setSelectedYear] = useState<number>(2024)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedLicenseTypes, setExpandedLicenseTypes] = useState<Set<string>>(new Set())

  const regsByCategory = useMemo(() => {
    const filtered = selectedCategory === 'all' ? regs : regs.filter(r => r.category === selectedCategory)
    const groups: Record<string, Regulation[]> = {}
    for (const reg of filtered) {
      if (!groups[reg.category]) groups[reg.category] = []
      groups[reg.category].push(reg)
    }
    return groups
  }, [regs, selectedCategory])

  const licensesByType = useMemo(() => {
    const groups: Record<string, License[]> = {}
    for (const lic of licensesList) {
      const t = lic.licenseType || 'other'
      if (!groups[t]) groups[t] = []
      groups[t].push(lic)
    }
    return groups
  }, [licensesList])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const [regData, seasonsData, licensesData] = await Promise.all([
          api.getStateRegulations(stateCode, { year: selectedYear }),
          api.getStateSeasons(stateCode, { year: selectedYear }),
          api.getStateLicenses(stateCode),
        ])
        setStateInfo(regData.state as StateInfo)
        setRegs(regData.regulations as Regulation[])
        setSeasonsList(seasonsData.seasons as Season[])
        setLicensesList(licensesData.licenses as License[])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load state data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    setExpandedCategories(new Set())
  }, [stateCode, selectedYear])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-800 dark:text-red-200">{error}</p>
          <Link to="/regulations" className="text-accent-500 hover:underline mt-2 inline-block">Back to states</Link>
        </div>
      </div>
    )
  }

  const stateName = stateInfo?.name || stateCode.toUpperCase()

  function formatCategory(cat: string) {
    return cat.split(/[|_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' / ')
  }

  const categories = ['all', ...new Set(regs.map(r => r.category))]
  if (licensesList.length > 0 && !categories.includes('licenses')) {
    categories.push('licenses')
  }

  const filteredRegs = selectedCategory === 'all'
    ? regs
    : regs.filter(r => r.category === selectedCategory)

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        <Link to="/regulations" className="hover:text-accent-500">Regulations</Link>
        <ChevronRight className="w-4 h-4" />
        <span style={{ color: `rgb(var(--color-text-primary))` }}>{stateName}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
            {stateName} Hunting Regulations
          </h1>
          {stateInfo?.agencyName && (
            <p className="mt-2" style={{ color: `rgb(var(--color-text-secondary))` }}>
              Source: {stateInfo.agencyUrl ? (
                <a href={stateInfo.agencyUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline inline-flex items-center gap-1">
                  {stateInfo.agencyName} <ExternalLink className="w-3 h-3" />
                </a>
              ) : stateInfo.agencyName}
            </p>
          )}
          {stateInfo?.lastScraped && (
            <p className="mt-1 text-sm" style={{ color: `rgb(var(--color-text-tertiary))` }}>
              Data last updated {new Date(stateInfo.lastScraped).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => navigate(`/chat?q=${encodeURIComponent(`What are the hunting regulations, license requirements, and season dates for ${stateName}?`)}`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 border border-accent-200 dark:border-accent-700 hover:bg-accent-100 dark:hover:bg-accent-900/50 transition-colors"
          >
            <MessageSquare className="w-4 h-4" /> Ask AI about {stateName}
          </button>
          <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md px-4 py-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              Always verify with official state sources
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <select
          value={selectedYear}
          onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedCategory('all') }}
          className="px-3 py-2 rounded-md text-sm font-medium border bg-earth-50 dark:bg-earth-800 text-earth-700 dark:text-earth-200 border-earth-200 dark:border-earth-700"
        >
          {[2025, 2024, 2023, 2022].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap border transition-colors ${
                  selectedCategory === cat
                    ? 'bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 border-accent-300 dark:border-accent-700'
                    : 'bg-earth-50 dark:bg-earth-800 text-earth-600 dark:text-earth-300 border-earth-200 dark:border-earth-700 hover:bg-earth-100 dark:hover:bg-earth-700'
                }`}
              >
                {cat === 'all' ? 'All' : cat.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Regulations */}
      {filteredRegs.length > 0 && (
        <div className="space-y-2 mb-8">
          <h2 className="text-xl font-semibold mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>
            Regulations <span className="text-sm font-normal ml-2" style={{ color: `rgb(var(--color-text-tertiary))` }}>({filteredRegs.length} total)</span>
          </h2>
          {Object.entries(regsByCategory).map(([cat, catRegs]) => {
            const isOpen = expandedCategories.has(cat)
            return (
              <div key={cat} className="card overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-earth-50 dark:hover:bg-earth-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? '' : '-rotate-90'}`} style={{ color: `rgb(var(--color-text-tertiary))` }} />
                    <span className="font-medium" style={{ color: `rgb(var(--color-text-primary))` }}>{formatCategory(cat)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-earth-100 dark:bg-earth-800" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                      {catRegs.length}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <div className="divide-y" style={{ borderTop: `1px solid rgb(var(--color-border-primary))`, borderColor: `rgb(var(--color-border-primary))` }}>
                    {catRegs.map((reg) => (
                      <div key={reg.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h3 className="font-medium" style={{ color: `rgb(var(--color-text-primary))` }}>{reg.title}</h3>
                          {reg.sourceUrl && (
                            <a href={reg.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline text-xs flex items-center gap-1 flex-shrink-0">
                              Source <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
                          {reg.summary || reg.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Seasons */}
      {selectedCategory === 'all' && seasonsList.length > 0 && (
        <div className="space-y-6 mb-8">
          <h2 className="text-xl font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>Seasons</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
                <tr>
                  <th className="text-left p-4 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Season</th>
                  <th className="text-left p-4 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Type</th>
                  <th className="text-left p-4 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Dates</th>
                  <th className="text-left p-4 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Bag Limit</th>
                  <th className="text-left p-4 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Restrictions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
                {seasonsList.map((season) => {
                  const bagLimit = season.bagLimit as { daily?: number; season?: number } | null
                  return (
                    <tr key={season.id}>
                      <td className="p-4 font-medium" style={{ color: `rgb(var(--color-text-primary))` }}>{season.name}</td>
                      <td className="p-4 capitalize" style={{ color: `rgb(var(--color-text-secondary))` }}>{season.seasonType || '-'}</td>
                      <td className="p-4" style={{ color: `rgb(var(--color-text-secondary))` }}>
                        {new Date(season.startDate).toLocaleDateString()} - {new Date(season.endDate).toLocaleDateString()}
                      </td>
                      <td className="p-4" style={{ color: `rgb(var(--color-text-secondary))` }}>
                        {bagLimit ? `${bagLimit.daily ?? '-'}/day, ${bagLimit.season ?? '-'}/season` : '-'}
                      </td>
                      <td className="p-4" style={{ color: `rgb(var(--color-text-secondary))` }}>{season.restrictions || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Licenses */}
      {(selectedCategory === 'all' || selectedCategory === 'licenses') && licensesList.length > 0 && (
        <div className="space-y-2 mb-8">
          <h2 className="text-xl font-semibold mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>
            License Requirements <span className="text-sm font-normal ml-2" style={{ color: `rgb(var(--color-text-tertiary))` }}>({licensesList.length} total)</span>
          </h2>
          {Object.entries(licensesByType).map(([type, typeLicenses]) => {
            const isOpen = expandedLicenseTypes.has(type)
            const label = type.charAt(0).toUpperCase() + type.slice(1)
            return (
              <div key={type} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedLicenseTypes(prev => {
                    const next = new Set(prev)
                    if (next.has(type)) next.delete(type)
                    else next.add(type)
                    return next
                  })}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-earth-50 dark:hover:bg-earth-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? '' : '-rotate-90'}`} style={{ color: `rgb(var(--color-text-tertiary))` }} />
                    <span className="font-medium" style={{ color: `rgb(var(--color-text-primary))` }}>{label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-earth-100 dark:bg-earth-800" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                      {typeLicenses.length}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <div className="divide-y" style={{ borderTop: `1px solid rgb(var(--color-border-primary))`, borderColor: `rgb(var(--color-border-primary))` }}>
                    {typeLicenses.map((license) => (
                      <div key={license.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h3 className="font-medium" style={{ color: `rgb(var(--color-text-primary))` }}>{license.name}</h3>
                          {license.isResidentOnly && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">Resident only</span>
                          )}
                        </div>
                        {license.description && (
                          <p className="text-sm mb-3" style={{ color: `rgb(var(--color-text-secondary))` }}>{license.description}</p>
                        )}
                        <div className="flex gap-4 text-sm">
                          {license.priceResident != null && (
                            <div>
                              <span style={{ color: `rgb(var(--color-text-tertiary))` }}>Resident:</span>{' '}
                              <span className="font-medium">${license.priceResident.toFixed(2)}</span>
                            </div>
                          )}
                          {license.priceNonResident != null && (
                            <div>
                              <span style={{ color: `rgb(var(--color-text-tertiary))` }}>Non-resident:</span>{' '}
                              <span className="font-medium">${license.priceNonResident.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                        {license.purchaseUrl && (
                          <a href={license.purchaseUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-500 hover:underline mt-3 inline-flex items-center gap-1">
                            Purchase <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {filteredRegs.length === 0 && seasonsList.length === 0 && licensesList.length === 0 && (
        <div className="text-center py-12 rounded-md" style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
          <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: `rgb(var(--color-text-tertiary))` }} />
          <p style={{ color: `rgb(var(--color-text-secondary))` }}>No regulation data available for {stateName} yet.</p>
          <p className="text-sm mt-1" style={{ color: `rgb(var(--color-text-tertiary))` }}>Data is being added state-by-state.</p>
        </div>
      )}
    </div>
  )
}

// ─── Listing page ─────────────────────────────────────────────────────────────

type StateRegCounts = Record<string, { regulations: number; seasons: number; licenses: number }>

export function RegulationsPage() {
  const { state } = useParams()
  const [statesList, setStatesList] = useState<StateInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [regCounts, setRegCounts] = useState<StateRegCounts>({})

  const [compareMode, setCompareMode] = useState(false)
  const [compareStates, setCompareStates] = useState<Set<string>>(new Set())

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const mapColors = getMapColors(resolvedTheme)

  useEffect(() => {
    if (!state) {
      api.getStates()
        .then(async (data) => {
          const states = data.states as StateInfo[]
          setStatesList(states)
          const counts: StateRegCounts = {}
          await Promise.all(states.map(async (s) => {
            try {
              const [regData, seasonsData, licensesData] = await Promise.all([
                api.getStateRegulations(s.code, { year: 2024 }),
                api.getStateSeasons(s.code),
                api.getStateLicenses(s.code),
              ])
              counts[s.code] = {
                regulations: (regData.regulations as unknown[]).length,
                seasons: (seasonsData.seasons as unknown[]).length,
                licenses: (licensesData.licenses as unknown[]).length,
              }
            } catch {
              counts[s.code] = { regulations: 0, seasons: 0, licenses: 0 }
            }
          }))
          setRegCounts(counts)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [state])

  const statesWithData = useMemo(() => new Set(statesList.map(s => s.code)), [statesList])

  const handleMapStateClick = useCallback((stateCode: string) => {
    if (compareMode) {
      setCompareStates(prev => {
        const next = new Set(prev)
        if (next.has(stateCode)) next.delete(stateCode)
        else if (next.size < 4) next.add(stateCode)
        return next
      })
    } else {
      setSelectedState(prev => prev === stateCode ? '' : stateCode)
    }
  }, [compareMode])

  function toggleCompareMode(enabled: boolean) {
    setCompareMode(enabled)
    setCompareStates(new Set())
    setSelectedState('')
  }

  function toggleCompareState(code: string) {
    setCompareStates(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else if (next.size < 4) next.add(code)
      return next
    })
  }

  const filtered = useMemo(() => {
    let list = statesList
    if (!compareMode && selectedState) {
      list = list.filter(s => s.code === selectedState)
    }
    if (search) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase())
      )
    }
    return list
  }, [statesList, selectedState, compareMode, search])

  if (state) {
    return <StateDetailView stateCode={state} />
  }

  const compareStateList = Array.from(compareStates)

  return (
    <div>
      {/* Header */}
      <div className="bg-earth-900 dark:bg-[#0d1117] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Hunting Regulations by State</h1>
          </div>
          <p className="text-earth-300 max-w-2xl">
            Select a state to view current hunting regulations, seasons, and license requirements.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Limited data notice */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md px-4 py-3 mb-6 text-sm text-yellow-800 dark:text-yellow-200">
          Regulation data is currently limited to select states. We're actively working to expand coverage across all 50 states.
        </div>

        {/* Mode toggle */}
        <div
          className="flex gap-1 p-1 rounded-lg mb-6 w-fit"
          style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}
        >
          <button
            onClick={() => toggleCompareMode(false)}
            className={`py-2 px-5 rounded-md text-sm font-medium transition-colors ${
              !compareMode
                ? 'bg-white dark:bg-earth-900 shadow-sm'
                : 'hover:bg-earth-100 dark:hover:bg-earth-700'
            }`}
            style={{ color: `rgb(var(--color-text-primary))` }}
          >
            All States
          </button>
          <button
            onClick={() => toggleCompareMode(true)}
            className={`py-2 px-5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              compareMode
                ? 'bg-white dark:bg-earth-900 shadow-sm'
                : 'hover:bg-earth-100 dark:hover:bg-earth-700'
            }`}
            style={{ color: `rgb(var(--color-text-primary))` }}
          >
            Compare States
            {compareMode && compareStates.size > 0 && (
              <span className="bg-accent-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center leading-none">
                {compareStates.size}
              </span>
            )}
          </button>
        </div>

        {/* US State Map */}
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>
              {compareMode
                ? `Select states to compare (${compareStates.size}/4)`
                : 'Select a state'
              }
              {!compareMode && selectedState && (
                <button
                  onClick={() => setSelectedState('')}
                  className="ml-2 text-xs text-accent-500 hover:text-accent-600 underline"
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
                <span className="w-3 h-3 rounded-sm bg-accent-500 inline-block" /> {compareMode ? 'Selected' : 'Selected'}
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
                  const isSelected = compareMode ? compareStates.has(stateCode) : selectedState === stateCode
                  const isClickable = hasData
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => isClickable && handleMapStateClick(stateCode)}
                      style={{
                        default: {
                          fill: isSelected ? mapColors.selected : hasData ? mapColors.hasData : mapColors.empty,
                          stroke: mapColors.stroke,
                          strokeWidth: 0.5,
                          outline: 'none',
                          cursor: isClickable ? 'pointer' : 'default',
                        },
                        hover: {
                          fill: isSelected ? mapColors.selectedHover : hasData ? mapColors.hasDataHover : mapColors.empty,
                          stroke: hasData ? mapColors.selected : mapColors.stroke,
                          strokeWidth: hasData ? 1.5 : 0.5,
                          outline: 'none',
                          cursor: isClickable ? 'pointer' : 'default',
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

        {/* Compare mode: selected state badges */}
        {compareMode && (
          <div className="flex items-center gap-2 flex-wrap mb-6 min-h-[32px]">
            {compareStates.size === 0 ? (
              <p className="text-sm" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                Click states on the map or cards below to add them to comparison
              </p>
            ) : (
              <>
                {compareStateList.map(code => {
                  const info = statesList.find(s => s.code === code)
                  return (
                    <span
                      key={code}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border bg-accent-50 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-700"
                    >
                      {info?.name || code}
                      <button
                        onClick={() => toggleCompareState(code)}
                        className="hover:text-accent-900 dark:hover:text-accent-100 transition-colors"
                        aria-label={`Remove ${info?.name || code}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )
                })}
                {compareStates.size < 4 && (
                  <span className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                    + add up to {4 - compareStates.size} more
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Comparison table (compare mode, 2+ states selected) */}
        {compareMode && compareStates.size >= 2 && (
          <CompareTable stateCodes={compareStateList} statesList={statesList} />
        )}

        {/* Placeholder when compare mode but not enough states */}
        {compareMode && compareStates.size < 2 && (
          <div
            className="rounded-lg border-2 border-dashed px-6 py-10 text-center mb-8"
            style={{ borderColor: `rgb(var(--color-border-primary))` }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: `rgb(var(--color-text-secondary))` }}>
              Select at least 2 states to see the comparison
            </p>
            <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
              Use the map above or check states in the list below
            </p>
          </div>
        )}

        {/* Search */}
        <div className="mb-8">
          <input
            type="text"
            placeholder={compareMode ? 'Filter states...' : 'Search states...'}
            className="input max-w-md"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
          </div>
        ) : (
          <>
            {/* State grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((s) => {
                if (compareMode) {
                  const isChecked = compareStates.has(s.code)
                  const isDisabled = !isChecked && compareStates.size >= 4
                  return (
                    <div
                      key={s.code}
                      onClick={() => !isDisabled && toggleCompareState(s.code)}
                      className={`card p-4 transition-colors select-none ${
                        isDisabled
                          ? 'opacity-40 cursor-not-allowed'
                          : isChecked
                          ? 'border-accent-400 dark:border-accent-500 cursor-pointer'
                          : 'hover:border-earth-300 dark:hover:border-earth-600 cursor-pointer'
                      }`}
                      style={isChecked ? { backgroundColor: `rgb(var(--color-bg-secondary))` } : {}}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="w-4 h-4 accent-accent-500 flex-shrink-0"
                          tabIndex={-1}
                        />
                        <div className="flex-1 flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>{s.name}</h3>
                            <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>{s.agencyName || 'Wildlife Agency'}</p>
                          </div>
                        </div>
                      </div>
                      {regCounts[s.code] && (
                        <div className="flex gap-3 text-xs pt-2" style={{ color: `rgb(var(--color-text-tertiary))`, borderTop: `1px solid rgb(var(--color-border-primary))` }}>
                          <span>Regs: <strong style={{ color: `rgb(var(--color-text-secondary))` }}>{regCounts[s.code].regulations}</strong></span>
                          <span>Seasons: <strong style={{ color: `rgb(var(--color-text-secondary))` }}>{regCounts[s.code].seasons}</strong></span>
                          <span>Licenses: <strong style={{ color: `rgb(var(--color-text-secondary))` }}>{regCounts[s.code].licenses}</strong></span>
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <Link
                    key={s.code}
                    to={`/regulations/${s.code.toLowerCase()}`}
                    className="card p-4 hover:border-accent-400 dark:hover:border-accent-500 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent-50 dark:bg-accent-900/30 rounded-md flex items-center justify-center">
                          <FileText className="w-5 h-5 text-accent-500" />
                        </div>
                        <div>
                          <h3 className="font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>{s.name}</h3>
                          <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>{s.agencyName || 'Wildlife Agency'}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5" style={{ color: `rgb(var(--color-text-tertiary))` }} />
                    </div>
                    {regCounts[s.code] && (
                      <div className="flex gap-3 text-xs pt-2" style={{ color: `rgb(var(--color-text-tertiary))`, borderTop: `1px solid rgb(var(--color-border-primary))` }}>
                        <span>Regulations: <strong style={{ color: `rgb(var(--color-text-secondary))` }}>{regCounts[s.code].regulations}</strong></span>
                        <span>Seasons: <strong style={{ color: `rgb(var(--color-text-secondary))` }}>{regCounts[s.code].seasons}</strong></span>
                        <span>Licenses: <strong style={{ color: `rgb(var(--color-text-secondary))` }}>{regCounts[s.code].licenses}</strong></span>
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>

            {filtered.length === 0 && statesList.length > 0 && (
              <p className="text-center py-8" style={{ color: `rgb(var(--color-text-secondary))` }}>No states match "{search}"</p>
            )}

            {statesList.length === 0 && (
              <div className="text-center py-8 rounded-md" style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
                <p style={{ color: `rgb(var(--color-text-secondary))` }}>No states loaded yet. Run the seed script to populate initial data.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
