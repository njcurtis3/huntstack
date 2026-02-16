import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { api } from '../lib/api'

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
        <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-800">{error}</p>
          <Link to="/regulations" className="text-red-600 underline mt-2 inline-block">Back to states</Link>
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
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/regulations" className="hover:text-gray-700">Regulations</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{stateName}</span>
      </nav>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {stateName} Hunting Regulations
          </h1>
          {stateInfo?.agencyName && (
            <p className="text-gray-600 mt-2">
              Source: {stateInfo.agencyUrl ? (
                <a href={stateInfo.agencyUrl} target="_blank" rel="noopener noreferrer" className="text-forest-600 hover:underline inline-flex items-center gap-1">
                  {stateInfo.agencyName} <ExternalLink className="w-3 h-3" />
                </a>
              ) : stateInfo.agencyName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          <AlertCircle className="w-5 h-5 text-yellow-600" />
          <span className="text-sm text-yellow-800">
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
      )}

      {/* Regulations */}
      {filteredRegs.length > 0 && (
        <div className="space-y-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900">Regulations</h2>
          {filteredRegs.map((reg) => (
            <div key={reg.id} className="card">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{reg.title}</h3>
                  <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5 mt-1 inline-block">
                    {reg.category}
                  </span>
                </div>
                {reg.sourceUrl && (
                  <a href={reg.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-forest-600 hover:underline text-sm flex items-center gap-1">
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="p-6">
                {reg.summary ? (
                  <p className="text-gray-700 mb-4">{reg.summary}</p>
                ) : (
                  <p className="text-gray-700 whitespace-pre-wrap">{reg.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Seasons */}
      {selectedCategory === 'all' && seasonsList.length > 0 && (
        <div className="space-y-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900">Seasons</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-600">Season</th>
                  <th className="text-left p-4 font-medium text-gray-600">Type</th>
                  <th className="text-left p-4 font-medium text-gray-600">Dates</th>
                  <th className="text-left p-4 font-medium text-gray-600">Bag Limit</th>
                  <th className="text-left p-4 font-medium text-gray-600">Restrictions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {seasonsList.map((season) => {
                  const bagLimit = season.bagLimit as { daily?: number; season?: number } | null
                  return (
                    <tr key={season.id}>
                      <td className="p-4 font-medium text-gray-900">{season.name}</td>
                      <td className="p-4 text-gray-600 capitalize">{season.seasonType || '-'}</td>
                      <td className="p-4 text-gray-600">
                        {new Date(season.startDate).toLocaleDateString()} - {new Date(season.endDate).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-gray-600">
                        {bagLimit ? `${bagLimit.daily ?? '-'}/day, ${bagLimit.season ?? '-'}/season` : '-'}
                      </td>
                      <td className="p-4 text-gray-600">{season.restrictions || '-'}</td>
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
          <h2 className="text-xl font-semibold text-gray-900">License Requirements</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {licensesList.map((license) => (
              <div key={license.id} className="card p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{license.name}</h3>
                  <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
                    {license.licenseType}
                  </span>
                </div>
                {license.description && (
                  <p className="text-sm text-gray-600 mb-3">{license.description}</p>
                )}
                <div className="flex gap-4 text-sm">
                  {license.priceResident != null && (
                    <div>
                      <span className="text-gray-500">Resident:</span>{' '}
                      <span className="font-medium">${license.priceResident.toFixed(2)}</span>
                    </div>
                  )}
                  {license.priceNonResident != null && (
                    <div>
                      <span className="text-gray-500">Non-resident:</span>{' '}
                      <span className="font-medium">${license.priceNonResident.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                {license.isResidentOnly && (
                  <p className="text-xs text-amber-600 mt-2">Resident only</p>
                )}
                {license.purchaseUrl && (
                  <a href={license.purchaseUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-forest-600 hover:underline mt-3 inline-flex items-center gap-1">
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
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No regulation data available for {stateName} yet.</p>
          <p className="text-sm text-gray-500 mt-1">Data is being added state-by-state.</p>
        </div>
      )}
    </div>
  )
}

type StateRegCounts = Record<string, { regulations: number; seasons: number; licenses: number }>

export function RegulationsPage() {
  const { state } = useParams()
  const navigate = useNavigate()
  const [statesList, setStatesList] = useState<StateInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [regCounts, setRegCounts] = useState<StateRegCounts>({})

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
      <div className="bg-gradient-to-br from-forest-900 to-forest-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Hunting Regulations by State</h1>
          </div>
          <p className="text-forest-200 max-w-2xl">
            Select a state to view current hunting regulations, seasons, and license requirements.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Limited data notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-6 text-sm text-yellow-800">
          Regulation data is currently limited to select states. We're actively working to expand coverage across all 50 states.
        </div>

        {/* US State Map */}
        <div className="card p-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-gray-600">
              Select a state {selectedState && (
                <button
                  onClick={() => setSelectedState('')}
                  className="ml-2 text-xs text-forest-600 hover:text-forest-800 underline"
                >
                  Clear selection
                </button>
              )}
            </h2>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-forest-200 inline-block" /> Has data
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-forest-600 inline-block" /> Selected
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-gray-100 inline-block border border-gray-200" /> No data
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
                          fill: isSelected ? '#16a34a' : hasData ? '#bbf7d0' : '#f3f4f6',
                          stroke: '#9ca3af',
                          strokeWidth: 0.5,
                          outline: 'none',
                          cursor: hasData ? 'pointer' : 'default',
                        },
                        hover: {
                          fill: isSelected ? '#15803d' : hasData ? '#86efac' : '#f3f4f6',
                          stroke: hasData ? '#16a34a' : '#9ca3af',
                          strokeWidth: hasData ? 1.5 : 0.5,
                          outline: 'none',
                          cursor: hasData ? 'pointer' : 'default',
                        },
                        pressed: {
                          fill: isSelected ? '#166534' : hasData ? '#4ade80' : '#f3f4f6',
                          stroke: '#16a34a',
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
          <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
        </div>
      ) : (
        <>
          {/* State Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s) => (
              <Link
                key={s.code}
                to={`/regulations/${s.code.toLowerCase()}`}
                className="card p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-forest-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-forest-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{s.name}</h3>
                      <p className="text-xs text-gray-500">{s.agencyName || 'Wildlife Agency'}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
                {regCounts[s.code] && (
                  <div className="flex gap-3 text-xs text-gray-500 border-t border-gray-100 pt-2">
                    <span>Regulations: <strong className="text-gray-700">{regCounts[s.code].regulations}</strong></span>
                    <span>Seasons: <strong className="text-gray-700">{regCounts[s.code].seasons}</strong></span>
                    <span>Licenses: <strong className="text-gray-700">{regCounts[s.code].licenses}</strong></span>
                  </div>
                )}
              </Link>
            ))}
          </div>

          {filtered.length === 0 && statesList.length > 0 && (
            <p className="text-center text-gray-500 py-8">No states match "{search}"</p>
          )}

          {statesList.length === 0 && (
            <div className="text-center py-8 bg-gray-50 rounded-xl">
              <p className="text-gray-600">No states loaded yet. Run the seed script to populate initial data.</p>
            </div>
          )}


        </>
      )}
      </div>
    </div>
  )
}
