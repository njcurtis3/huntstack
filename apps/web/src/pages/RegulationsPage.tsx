import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, FileText, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
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

function StateDetailView({ stateCode }: { stateCode: string }) {
  const [stateInfo, setStateInfo] = useState<StateInfo | null>(null)
  const [regs, setRegs] = useState<Regulation[]>([])
  const [seasonsList, setSeasonsList] = useState<Season[]>([])
  const [licensesList, setLicensesList] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const [regData, seasonsData, licensesData] = await Promise.all([
          api.getStateRegulations(stateCode),
          api.getStateSeasons(stateCode),
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
  }, [stateCode])

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

  // Get unique categories from regulations
  const categories = ['all', ...new Set(regs.map(r => r.category))]
  if (licensesList.length > 0 && !categories.includes('licenses')) {
    categories.push('licenses')
  }

  const filteredRegs = selectedCategory === 'all'
    ? regs
    : regs.filter(r => r.category === selectedCategory)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        <Link to="/regulations" className="hover:text-accent-500">Regulations</Link>
        <ChevronRight className="w-4 h-4" />
        <span style={{ color: `rgb(var(--color-text-primary))` }}>{stateName}</span>
      </nav>

      <div className="flex items-start justify-between mb-8">
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
        </div>
        <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md px-4 py-2">
          <AlertCircle className="w-5 h-5 text-yellow-600" />
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            Always verify with official state sources
          </span>
        </div>
      </div>

      {/* Category Filter */}
      {categories.length > 1 && (
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
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

      {/* Regulations */}
      {filteredRegs.length > 0 && (
        <div className="space-y-6 mb-8">
          <h2 className="text-xl font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>Regulations</h2>
          {filteredRegs.map((reg) => (
            <div key={reg.id} className="card">
              <div className="p-6 flex items-center justify-between" style={{ borderBottom: `1px solid rgb(var(--color-border-primary))` }}>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>{reg.title}</h3>
                  <span className="text-xs bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-300 rounded px-2 py-0.5 mt-1 inline-block">
                    {reg.category}
                  </span>
                </div>
                {reg.sourceUrl && (
                  <a href={reg.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline text-sm flex items-center gap-1">
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="p-6">
                {reg.summary ? (
                  <p style={{ color: `rgb(var(--color-text-secondary))` }} className="mb-4">{reg.summary}</p>
                ) : (
                  <p style={{ color: `rgb(var(--color-text-secondary))` }} className="whitespace-pre-wrap">{reg.content}</p>
                )}
              </div>
            </div>
          ))}
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
        <div className="space-y-6">
          <h2 className="text-xl font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>License Requirements</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {licensesList.map((license) => (
              <div key={license.id} className="card p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>{license.name}</h3>
                  <span className="text-xs bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-300 rounded px-2 py-0.5">
                    {license.licenseType}
                  </span>
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
                {license.isResidentOnly && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Resident only</p>
                )}
                {license.purchaseUrl && (
                  <a href={license.purchaseUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-500 hover:underline mt-3 inline-flex items-center gap-1">
                    Purchase <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
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

type StateRegCounts = Record<string, { regulations: number; seasons: number; licenses: number }>

export function RegulationsPage() {
  const { state } = useParams()
  const [statesList, setStatesList] = useState<StateInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [regCounts, setRegCounts] = useState<StateRegCounts>({})

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const mapColors = getMapColors(resolvedTheme)

  useEffect(() => {
    if (!state) {
      api.getStates()
        .then(async (data) => {
          const states = data.states as StateInfo[]
          setStatesList(states)
          // Fetch regulation counts for each state in parallel
          const counts: StateRegCounts = {}
          await Promise.all(states.map(async (s) => {
            try {
              const [regData, seasonsData, licensesData] = await Promise.all([
                api.getStateRegulations(s.code),
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

  const statesWithData = useMemo(() => {
    return new Set(statesList.map(s => s.code))
  }, [statesList])

  const handleMapStateClick = useCallback((stateCode: string) => {
    setSelectedState(prev => prev === stateCode ? '' : stateCode)
  }, [])

  const filtered = useMemo(() => {
    let list = statesList
    if (selectedState) {
      list = list.filter(s => s.code === selectedState)
    }
    if (search) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase())
      )
    }
    return list
  }, [statesList, selectedState, search])

  if (state) {
    return <StateDetailView stateCode={state} />
  }

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

        {/* Search */}
        <div className="mb-8">
        <input
          type="text"
          placeholder="Search states..."
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
          {/* State Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s) => (
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
            ))}
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
