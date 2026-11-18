import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Loader2, Crosshair, TrendingUp, TrendingDown, Minus,
  CheckCircle2, XCircle, AlertCircle, Wind,
  MapPin, Navigation, X as XIcon, ArrowUpDown, HelpCircle, Ban, Map as MapIcon, ChevronDown,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api, type HuntArea, type HuntAreaLand, type HuntAreaPlace } from '../lib/api'
import { parseCalendarDate } from '../lib/dates'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const AREA_STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO', 'IL', 'IA']

// Where a hunter checks seasons for a state HuntStack has no season dates for
const STATE_AGENCIES: Record<string, { name: string; url: string }> = {
  MO: { name: 'Missouri Dept. of Conservation', url: 'https://mdc.mo.gov/hunting-trapping/species/waterfowl' },
  IL: { name: 'Illinois DNR', url: 'https://dnr.illinois.gov/hunting/waterfowl.html' },
  IA: { name: 'Iowa DNR', url: 'https://www.iowadnr.gov/hunting/migratory-game-birds' },
}

type Access = NonNullable<HuntAreaPlace['access']>

const ACCESS_CONFIG: Record<Access, { label: string; className: string }> = {
  public:  { label: 'Public hunting', className: 'bg-forest-100 dark:bg-forest-900/40 text-forest-700 dark:text-forest-300' },
  limited: { label: 'Limited public hunting', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' },
  closed:  { label: 'Closed to hunting', className: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  private: { label: 'Private', className: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  unknown: { label: 'Access not verified', className: 'bg-earth-100 dark:bg-earth-800 text-earth-700 dark:text-earth-300' },
}

const KIND_LABEL: Record<HuntAreaPlace['kind'], string> = {
  survey: 'Survey',
  ebird: 'eBird',
  report: 'Hunter report',
}

const muted = { color: 'rgb(var(--color-text-tertiary))' }
const secondary = { color: 'rgb(var(--color-text-secondary))' }
const primary = { color: 'rgb(var(--color-text-primary))' }
const border = { borderColor: 'rgb(var(--color-border-primary))' }

const toMiles = (km: number) => km * 0.621371

function shortDate(d: string | null): string | null {
  return d ? parseCalendarDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
}

function ChangeBadge({ change }: { change: HuntArea['change'] }) {
  if (!change) return <span className="text-xs" style={muted}>No earlier survey to compare</span>
  const p = change.percent
  const Icon = p >= 5 ? TrendingUp : p <= -5 ? TrendingDown : Minus
  const cls = p >= 5 ? 'text-forest-600 dark:text-forest-400' : p <= -5 ? 'text-red-600 dark:text-red-400' : ''
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`} style={cls ? undefined : muted}>
      <Icon className="w-3.5 h-3.5" />
      {p > 0 ? '+' : ''}{p}% since the previous surveys
    </span>
  )
}

function AccessBadge({ access }: { access: Access }) {
  const cfg = ACCESS_CONFIG[access]
  const Icon = access === 'closed' || access === 'private' ? Ban : access === 'unknown' ? HelpCircle : CheckCircle2
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${cfg.className}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function PlaceRow({ place }: { place: HuntAreaPlace }) {
  const name = place.url
    ? <a href={place.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-accent-600 dark:hover:text-accent-400">{place.name}</a>
    : place.name
  return (
    <li className="py-2 border-b last:border-0 text-sm" style={border}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium break-words" style={primary}>{name}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs" style={muted}>
            <span>{KIND_LABEL[place.kind]}</span>
            {place.access && <AccessBadge access={place.access} />}
            {place.topSpecies.length > 0 && <span>{place.topSpecies.map(s => s.name).join(', ')}</span>}
          </div>
          {place.accessNote && <p className="text-xs mt-0.5" style={secondary}>{place.accessNote}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-mono tabular-nums" style={primary}>{place.birds > 0 ? place.birds.toLocaleString() : '—'}</p>
          {place.date && <p className="text-xs" style={muted}>{shortDate(place.date)}</p>}
        </div>
      </div>
    </li>
  )
}

function LandRow({ land }: { land: HuntAreaLand }) {
  const maps = `https://www.google.com/maps/search/?api=1&query=${land.lat},${land.lng}`
  const away = toMiles(land.distanceKm)
  return (
    <li className="py-2 border-b last:border-0 text-sm" style={border}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={maps} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-dotted break-words hover:text-accent-600 dark:hover:text-accent-400" style={primary}>
            {land.name}
          </a>
          <p className="text-xs mt-0.5 flex flex-wrap gap-x-2 gap-y-1" style={muted}>
            <span>{land.kind}</span>
            {land.manager && <span>{land.manager}</span>}
            <span>{land.acres.toLocaleString()} acres</span>
            <span className={land.access === 'OA' ? 'text-forest-700 dark:text-forest-300' : 'text-amber-700 dark:text-amber-300'}>
              {land.access === 'OA' ? 'Open to the public' : 'Permit or seasonal access'}
            </span>
          </p>
          {land.note && <p className="text-xs mt-0.5 font-medium" style={secondary}>{land.note}</p>}
        </div>
        <p className="text-xs text-right flex-shrink-0 whitespace-nowrap" style={muted}>
          {away < 1 ? 'in the area' : `${Math.round(away)} mi ${land.direction}`}
        </p>
      </div>
    </li>
  )
}

/** One-line summary shown while a card is collapsed: birds, change, season, top species */
function AreaSummaryLine({ area }: { area: HuntArea }) {
  const p = area.change?.percent
  const changeCls = p === undefined ? '' : p >= 5 ? 'text-forest-600 dark:text-forest-400' : p <= -5 ? 'text-red-600 dark:text-red-400' : ''
  const season = area.season.status === 'open' ? 'Season open' : area.season.status === 'closed' ? 'Season closed' : 'Season: check agency'
  return (
    <p className="text-sm mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5" style={secondary}>
      <span className="font-mono font-medium tabular-nums" style={primary}>{area.birds.toLocaleString()} birds</span>
      {p !== undefined && (
        <span className={`font-medium ${changeCls}`} style={changeCls ? undefined : muted}>{p > 0 ? '+' : ''}{p}%</span>
      )}
      <span className={area.season.status === 'open' ? 'text-forest-700 dark:text-forest-400' : ''}
        style={area.season.status === 'open' ? undefined : muted}>{season}</span>
      {area.topSpecies[0] && <span style={muted}>Mostly {area.topSpecies[0].name.toLowerCase()}</span>}
    </p>
  )
}

function AreaCard({ area, place, distMi, open, onToggle }: {
  /** place: the area's position in the Best order (the API's list order), kept when sorted by distance */
  area: HuntArea; place: number; distMi: number | null; open: boolean; onToggle: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const panelId = `area-${area.id}-details`
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${area.center.lat},${area.center.lng}`
  const places = showAll ? area.evidence : area.evidence.slice(0, 4)
  const seasonIcon = area.season.status === 'open'
    ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-forest-600 dark:text-forest-400" />
    : area.season.status === 'closed'
      ? <XCircle className="w-4 h-4 flex-shrink-0" style={muted} />
      : <HelpCircle className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />

  return (
    <article className={`border-b ${open ? 'py-6' : 'py-4'}`} style={border}>
      {/* Header: the whole header opens and closes the card; the title button is the control
          for keyboard and screen readers (its click bubbles up to the header, so no handler of its own) */}
      <div className="flex items-start gap-3 cursor-pointer" onClick={onToggle}>
        <span
          className={`inline-flex w-7 pt-1 font-mono text-sm font-medium flex-shrink-0 ${place <= 3 ? 'text-accent-600 dark:text-accent-400' : ''}`}
          style={place <= 3 ? undefined : muted}
        >
          {place}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-lg tracking-tight break-words" style={primary}>
                <button type="button" aria-expanded={open} aria-controls={panelId}
                  className="text-left inline-flex items-start gap-1.5 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                  <span>{area.title}</span>
                  <ChevronDown className={`w-5 h-5 mt-1 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={muted} aria-hidden="true" />
                </button>
              </h3>
              <p className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1" style={muted}>
                {area.county && <span>{area.county}</span>}
                <span>{area.state}</span>
                <span>about {Math.max(5, Math.round(toMiles(area.radiusKm)))} mi around</span>
                {distMi !== null && (
                  <span className="inline-flex items-center gap-0.5 font-medium" style={secondary}>
                    <Navigation className="w-3 h-3" />
                    {Math.round(distMi)} mi from you
                  </span>
                )}
              </p>
              {!open && <AreaSummaryLine area={area} />}
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 flex-shrink-0"
              aria-label={`Open ${area.title} in Google Maps (new tab)`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              Map
            </a>
          </div>
        </div>
      </div>

      {open && (
        <div id={panelId} className="pl-10">
          {/* Numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
            <div>
              <p className="text-xs mb-1" style={muted}>Birds counted nearby</p>
              <p className="font-mono text-2xl font-medium tabular-nums" style={primary}>{area.birds.toLocaleString()}</p>
              <ChangeBadge change={area.change} />
              {area.latestDate && <p className="text-xs mt-0.5" style={muted}>Latest {shortDate(area.latestDate)}</p>}
            </div>
            <div>
              <p className="text-xs mb-1" style={muted}>Season on your date</p>
              <div className="flex items-start gap-1.5">
                {seasonIcon}
                <div className="text-sm" style={secondary}>
                  {area.season.status === 'open' && area.season.lines.map(l => <p key={l}>{l}</p>)}
                  {area.season.status === 'closed' && <p>Closed on this date</p>}
                  {area.season.status === 'unknown' && (
                    STATE_AGENCIES[area.state]
                      ? <a href={STATE_AGENCIES[area.state].url} target="_blank" rel="noopener noreferrer" className="underline text-accent-600 dark:text-accent-400">Check {STATE_AGENCIES[area.state].name}</a>
                      : <p>No season data — check the state agency</p>
                  )}
                </div>
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs mb-1" style={muted}>Most counted</p>
              {area.topSpecies.length > 0 ? (
                <ul className="text-sm space-y-0.5" style={secondary}>
                  {area.topSpecies.slice(0, 3).map(s => (
                    <li key={s.slug} className="flex justify-between gap-3">
                      <span>{s.name}</span>
                      <span className="font-mono tabular-nums">{s.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm" style={muted}>Seen, not counted</p>}
              {area.push && area.push.score > 0 && (
                <p className="mt-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Wind className="w-3 h-3" />
                  Weather push {area.push.score}/3{area.push.coldFrontPresent ? ' · cold front' : area.push.coldFrontIncoming ? ' · front coming' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Why */}
          {area.reasons.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium mb-1" style={secondary}>Why it ranks here</p>
              <ul className="text-sm list-disc pl-5 space-y-0.5" style={secondary}>
                {area.reasons.map(r => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}

          {/* Where to hunt in the area */}
          <div className="mt-4">
            <p className="text-xs font-medium mb-1" style={secondary}>Public land in and near this area</p>
            {area.publicLands.length > 0 || area.huntable.length > 0 ? (
              <>
                <ul>
                  {area.publicLands.map(l => <LandRow key={`l-${l.name}`} land={l} />)}
                  {area.huntable.map(p => <PlaceRow key={`h-${p.kind}-${p.name}`} place={p} />)}
                </ul>
                <p className="text-xs mt-1" style={muted}>
                  Public access from the USGS Protected Areas Database. Hunting rules differ by unit (zones,
                  permits, days, refuge closures): check the managing agency before you go.
                </p>
              </>
            ) : (
              <p className="text-sm" style={muted}>
                No public wildlife areas, refuges or Corps land within reach of this area that we know of.
                Birds feed well beyond the sites counted: check {area.state}'s public hunting maps near{' '}
                {area.town ?? 'this area'}, or ask landowners.
              </p>
            )}
          </div>

          {/* Evidence */}
          <div className="mt-4">
            <p className="text-xs font-medium mb-1" style={secondary}>
              Where birds were counted or reported ({area.evidenceCount})
            </p>
            <ul>{places.map(p => <PlaceRow key={`e-${p.kind}-${p.name}`} place={p} />)}</ul>
            {area.evidence.length > 4 && (
              <button onClick={() => setShowAll(v => !v)} className="text-xs underline text-accent-600 dark:text-accent-400 py-1">
                {showAll ? 'Show fewer' : `Show ${area.evidence.length - 4} more`}
              </button>
            )}
            {area.evidenceCount > area.evidence.length && showAll && (
              <p className="text-xs" style={muted}>and {area.evidenceCount - area.evidence.length} smaller reports</p>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

type SpeciesOption = { slug: string; name: string }

export function WhereToHuntPage() {
  // Filters live in the URL so a search can be shared, bookmarked and refreshed
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedSpecies, setSelectedSpecies] = useState(() => searchParams.get('species') ?? '')
  const [selectedStates, setSelectedStates] = useState<Set<string>>(() => {
    const fromUrl = (searchParams.get('states') ?? '').split(',').filter(s => AREA_STATES.includes(s))
    return new Set(fromUrl.length > 0 ? fromUrl : AREA_STATES)
  })
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = searchParams.get('date')
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().split('T')[0]
  })
  const resultsRef = useRef<HTMLDivElement>(null)
  const [speciesOptions, setSpeciesOptions] = useState<SpeciesOption[]>([])

  const [areas, setAreas] = useState<HuntArea[] | null>(null)
  // Result cards are collapsible: a new set of results opens the top one, the rest start closed
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set())
  useEffect(() => { setOpenAreas(new Set(areas?.[0] ? [areas[0].id] : [])) }, [areas])
  const toggleArea = (id: string) => setOpenAreas(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const [totalAreas, setTotalAreas] = useState(0)
  const [statesWithoutSeasonData, setStatesWithoutSeasonData] = useState<string[]>([])
  const [ebirdMissing, setEbirdMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Near Me: the hunter's location, for distances and sorting
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [locationInput, setLocationInput] = useState('')
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [sortByDistance, setSortByDistance] = useState(false)
  const locationInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getSpecies({ category: 'waterfowl' }).then(data => {
      setSpeciesOptions(data.species.map(s => ({ slug: s.slug, name: s.name })))
    }).catch(() => {
      // The dropdown stays at "All Waterfowl"; searching still works
    })
  }, [])

  const resolveLocation = async (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return
    setLocationLoading(true)
    setLocationError(null)
    try {
      const isZip = /^\d{5}$/.test(trimmed)
      const result = isZip ? await api.geocodeZip(trimmed) : await api.geocodeCity(trimmed)
      if (!result) {
        setLocationError('Location not found. Try "Stuttgart, AR" or a zip code.')
        return
      }
      const label = result.city && result.state ? `${result.city}, ${result.state}` : trimmed
      setUserLocation({ lat: result.lat, lng: result.lng, label })
      setLocationInput(label)
      setSortByDistance(true)
    } catch {
      setLocationError('Could not resolve location.')
    } finally {
      setLocationLoading(false)
    }
  }

  const handleGps = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported by your browser.')
      return
    }
    setLocationLoading(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const result = await api.geocodeReverse(lat, lng)
          const label = result?.city && result?.state ? `${result.city}, ${result.state}` : `${lat.toFixed(3)}, ${lng.toFixed(3)}`
          setUserLocation({ lat, lng, label })
          setLocationInput(label)
          setSortByDistance(true)
        } catch {
          setUserLocation({ lat, lng, label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` })
          setSortByDistance(true)
        } finally {
          setLocationLoading(false)
        }
      },
      () => {
        setLocationError('Could not get your location.')
        setLocationLoading(false)
      },
      { timeout: 8000 },
    )
  }

  const clearLocation = () => {
    setUserLocation(null)
    setLocationInput('')
    setLocationError(null)
    setSortByDistance(false)
    locationInputRef.current?.focus()
  }

  const displayAreas = useMemo(() => {
    if (!areas) return null
    const annotated = areas.map((a, i) => ({
      area: a,
      place: i + 1,
      distMi: userLocation ? toMiles(haversineKm(userLocation.lat, userLocation.lng, a.center.lat, a.center.lng)) : null,
    }))
    return sortByDistance && userLocation
      ? [...annotated].sort((a, b) => (a.distMi ?? Infinity) - (b.distMi ?? Infinity))
      : annotated
  }, [areas, userLocation, sortByDistance])

  const toggleState = (code: string) => {
    setSelectedStates(prev => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code) // may leave none: Deselect all, then pick one or two
      } else {
        next.add(code)
      }
      return next
    })
  }

  const handleSearch = async () => {
    // No state picked: nothing to search (the API would read an empty list as every state)
    if (selectedStates.size === 0) return
    setLoading(true)
    setError(null)
    setHasSearched(true)
    const states = AREA_STATES.filter(s => selectedStates.has(s))
    const next = new URLSearchParams()
    if (selectedSpecies) next.set('species', selectedSpecies)
    next.set('date', selectedDate)
    if (states.length < AREA_STATES.length) next.set('states', states.join(','))
    next.set('go', '1')
    setSearchParams(next, { replace: true })
    // On a phone the results sit below the form; bring them into view
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    try {
      const data = await api.getHuntAreas({
        species: selectedSpecies || undefined,
        states: states.join(','),
        date: selectedDate,
      })
      setAreas(data.areas)
      setTotalAreas(data.totalAreas)
      setStatesWithoutSeasonData(data.statesWithoutSeasonData)
      setEbirdMissing(data.sources.ebird === null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find hunting areas')
      setAreas(null)
    } finally {
      setLoading(false)
    }
  }

  // A shared or refreshed search link runs its search
  useEffect(() => {
    if (searchParams.get('go') === '1') handleSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      {/* Hero */}
      <div className="bg-earth-900 dark:bg-[#121416] border-b border-earth-800 dark:border-[#24272b] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">Where to Hunt</h1>
          <p className="text-[#a7adb4] max-w-2xl leading-relaxed">
            The areas where ducks and geese are right now, from refuge and agency surveys, eBird reports and
            hunter reports, ranked by birds counted nearby, which way the counts are moving, the season and
            the weather. With several states picked, each state's best area comes first: states aren't
            surveyed alike, so their bird counts don't compare.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Input Panel */}
        <div className="card p-6 mb-8">
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div>
              <label htmlFor="wth-species" className="block text-sm font-medium mb-2" style={secondary}>Species</label>
              <select id="wth-species" className="input w-full" value={selectedSpecies} onChange={e => setSelectedSpecies(e.target.value)}>
                <option value="">All Waterfowl</option>
                {speciesOptions.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="wth-date" className="block text-sm font-medium mb-2" style={secondary}>Hunt Date</label>
              <input id="wth-date" type="date" className="input w-full" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => handleSearch()}
                disabled={loading || selectedStates.size === 0}
                data-fab-avoid
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                {loading ? 'Searching…' : 'Find Hunts'}
              </button>
            </div>
          </div>

          {/* Near Me */}
          <div className="border-t pt-5 mt-1" style={border}>
            <label htmlFor="wth-location" className="block text-sm font-medium mb-2" style={secondary}>
              Near Me <span className="font-normal text-xs ml-1" style={muted}>— distances and sorting from your location</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={muted} />
                <input
                  ref={locationInputRef}
                  id="wth-location"
                  type="text"
                  value={locationInput}
                  onChange={e => setLocationInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && resolveLocation(locationInput)}
                  placeholder="City, State or Zip Code"
                  className="input w-full pl-9 pr-8"
                />
                {locationInput && (
                  <button
                    onClick={clearLocation}
                    aria-label="Clear location"
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded hover:opacity-70"
                    style={muted}
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => resolveLocation(locationInput)}
                disabled={locationLoading || !locationInput.trim()}
                className="btn-secondary px-4 flex items-center gap-1.5 text-sm"
              >
                {locationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                Go
              </button>
              <button
                onClick={handleGps}
                disabled={locationLoading}
                title="Use my current location"
                aria-label="Use my current location"
                className="btn-secondary px-3 flex items-center gap-1.5 text-sm"
              >
                {locationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              </button>
            </div>
            {locationError && <p className="text-xs mt-1.5 text-red-600 dark:text-red-400">{locationError}</p>}
            {userLocation && (
              <p className="text-xs mt-1.5" style={muted}>
                Showing distances from <span className="font-medium" style={secondary}>{userLocation.label}</span>
              </p>
            )}
          </div>

          {/* State pills */}
          <div className="mt-5">
            <p id="wth-states" className="block text-sm font-medium mb-2" style={secondary}>States</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="wth-states">
              {AREA_STATES.map(code => {
                const active = selectedStates.has(code)
                return (
                  <button key={code} onClick={() => toggleState(code)} aria-pressed={active} className={`chip font-mono min-w-12 ${active ? 'chip-on' : ''}`}>
                    {code}
                  </button>
                )
              })}
              <button onClick={() => setSelectedStates(new Set(AREA_STATES))} className="chip border-dashed">All</button>
              <button onClick={() => setSelectedStates(new Set())} className="chip border-dashed" disabled={selectedStates.size === 0}>Deselect all</button>
            </div>
            {selectedStates.size === 0 && (
              <p className="text-xs mt-2 text-amber-700 dark:text-amber-400" role="status">Pick at least one state to search.</p>
            )}
          </div>
        </div>

        <div ref={resultsRef} className="scroll-mt-20" />

        <p className="mb-6 text-xs max-w-3xl" style={muted}>
          An area is everything counted or reported within about 12 miles of its busiest spot, named after a nearby town.
          Birds roost on refuges and feed for miles around, so a count at a refuge you can't hunt still tells you about
          the land around it. Ranked by birds counted, nudged up when counts are rising or a cold front is pushing birds,
          and down when the season is closed.
        </p>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-accent-500 mx-auto mb-3" />
              <p className="text-sm" style={secondary}>Gathering surveys, eBird reports, seasons and weather…</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">Couldn't load hunting areas</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && hasSearched && areas !== null && areas.length === 0 && (
          <div className="text-center py-16">
            <Crosshair className="w-12 h-12 mx-auto mb-3" style={muted} />
            <p className="text-lg font-medium mb-2" style={primary}>No areas with recent birds</p>
            <p className="text-sm" style={secondary}>
              Nothing was counted or reported in these states in the last few weeks. Try more states or all waterfowl,
              or check back after the next surveys.
            </p>
          </div>
        )}

        {!loading && !error && hasSearched && (statesWithoutSeasonData.length > 0 || ebirdMissing) && (
          <div className="card p-4 mb-4 text-sm space-y-2" style={secondary}>
            {statesWithoutSeasonData.length > 0 && (
              <p className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>HuntStack doesn't have season dates for {statesWithoutSeasonData.join(', ')} yet. Check dates with the state agency before you go.</span>
              </p>
            )}
            {ebirdMissing && (
              <p className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>eBird reports didn't load this time, so areas come from surveys and hunter reports only. Try again in a minute.</span>
              </p>
            )}
          </div>
        )}

        {!loading && !error && displayAreas && displayAreas.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 pb-3 border-b-2 border-earth-900 dark:border-earth-200 flex-wrap">
              <h2 className="text-xl font-semibold tracking-tight" style={primary}>Best areas</h2>
              <div className="flex items-center gap-3">
                {userLocation && (
                  <div className="flex items-center gap-1 text-xs">
                    <button onClick={() => setSortByDistance(false)} className={`chip min-h-8 text-xs ${!sortByDistance ? 'chip-on' : ''}`}>Best</button>
                    <button onClick={() => setSortByDistance(true)} className={`chip min-h-8 text-xs ${sortByDistance ? 'chip-on' : ''}`}>
                      <ArrowUpDown className="w-3 h-3" />
                      Nearest
                    </button>
                  </div>
                )}
                <span className="text-sm" style={muted}>{displayAreas.length} of {totalAreas} areas</span>
                {openAreas.size < displayAreas.length ? (
                  <button onClick={() => setOpenAreas(new Set(displayAreas.map(d => d.area.id)))} className="text-xs underline text-accent-600 dark:text-accent-400 py-1">
                    Expand all
                  </button>
                ) : (
                  <button onClick={() => setOpenAreas(new Set())} className="text-xs underline text-accent-600 dark:text-accent-400 py-1">
                    Collapse all
                  </button>
                )}
              </div>
            </div>
            <div>
              {displayAreas.map(({ area, place, distMi }) => (
                <AreaCard key={area.id} area={area} place={place} distMi={distMi}
                  open={openAreas.has(area.id)} onToggle={() => toggleArea(area.id)} />
              ))}
            </div>
            <p className="text-xs mt-4" style={muted}>
              Survey counts from refuges and state and university aerial surveys; community reports via eBird (Cornell Lab
              of Ornithology); hunter reports from HuntStack users, placed only to a rough grid. Always confirm access
              and regulations with the landowner or managing agency.
            </p>
          </>
        )}

        {!hasSearched && !loading && (
          <div className="text-center py-16">
            <Crosshair className="w-12 h-12 mx-auto mb-4 text-accent-500" />
            <p className="text-lg font-medium mb-2" style={primary}>Ready to find your next hunt?</p>
            <p className="text-sm mb-6 max-w-md mx-auto" style={secondary}>
              Pick a species, a date and your states, then hit "Find Hunts" to see the areas where birds are now.
            </p>
            <button onClick={() => handleSearch()} className="btn-primary">Find Hunts Now</button>
          </div>
        )}
      </div>
    </div>
  )
}
