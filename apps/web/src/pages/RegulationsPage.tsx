import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, ChevronDown, FileText, AlertCircle, ExternalLink, Loader2, MessageSquare, X, ZoomIn, ZoomOut, RotateCcw, LocateFixed, Map as MapIcon, CalendarPlus, Search } from 'lucide-react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { api } from '../lib/api'
import { useThemeStore } from '../stores/themeStore'
import { getMapColors } from '../lib/themeColors'
import { DismissibleNotice } from '../components/DismissibleNotice'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

// Current waterfowl season year: the fall-start year of the season now in play. Seasons run
// fall→winter (e.g. the "2026" season is Oct 2026–Jan 2027), so from July onward the current
// season is this calendar year; before July it's still last year's season. Computed rather than
// hardcoded so the default doesn't silently go stale each summer.
function currentSeasonYear(): number {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}
const SEASON_YEAR = currentSeasonYear()
const SEASON_YEAR_OPTIONS = [SEASON_YEAR, SEASON_YEAR - 1, SEASON_YEAR - 2, SEASON_YEAR - 3]

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
  /** Zone names the season applies to, e.g. ["High Plains Mallard Management Unit"] */
  units?: string[] | null
  speciesId?: string | null
  /** Set by mergeSpeciesRows when the species in one season have different limits */
  bySpecies?: { species: string; bagLimit: unknown }[]
}

/**
 * The database keeps one season row per species: "Light Geese" once for snow geese and once for
 * Ross's geese, teal once per teal. That is right for the species pages and the Map, but a hunter
 * reads it as the same season twice. Rows with the same name, dates and zones become one. When
 * their limits differ (New Mexico's "Geese": Canada 5, white-fronted 10, light 20 a day) the
 * season keeps the largest as its limit and lists each species' own limit.
 */
function mergeSpeciesRows(seasons: Season[], speciesNames: Map<string, string>): Season[] {
  const groups = new Map<string, Season[]>()
  for (const x of seasons) {
    const key = `${x.name}|${x.startDate}|${x.endDate}|${(x.units ?? []).join(',')}`
    groups.set(key, [...(groups.get(key) ?? []), x])
  }
  const daily = (x: Season) => (x.bagLimit as { daily?: number } | null)?.daily ?? -1
  return [...groups.values()].map(rows => {
    if (rows.length === 1) return rows[0]
    const bags = new Map<string, Season[]>()
    for (const x of rows) bags.set(JSON.stringify(x.bagLimit ?? null), [...(bags.get(JSON.stringify(x.bagLimit ?? null)) ?? []), x])
    const base = [...rows].sort((a, b) => daily(b) - daily(a))[0]
    if (bags.size === 1) return base
    const name = (id: string | null | undefined) => (id && speciesNames.get(id)) || 'Other species'
    const bySpecies = [...bags.values()]
      .map(same => ({ species: [...new Set(same.map(x => name(x.speciesId)))].join(' and '), bagLimit: same[0].bagLimit, d: daily(same[0]) }))
      .sort((a, b) => a.d - b.d)
      .map(({ species, bagLimit }) => ({ species, bagLimit }))
    return { ...base, bySpecies }
  })
}

let speciesNamesCache: Promise<Map<string, string>> | null = null
/** Waterfowl species names by id, for the per-species limits above (empty if the call fails) */
function loadSpeciesNames(): Promise<Map<string, string>> {
  speciesNamesCache ??= api.getSpecies({ category: 'waterfowl' })
    .then(r => new Map(r.species.map(x => [x.id, x.name])))
    .catch(() => { speciesNamesCache = null; return new Map<string, string>() })
  return speciesNamesCache
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

// ─── Season grouping ─────────────────────────────────────────────────────────

const SPECIAL_TYPES = new Set(['conservation-order', 'youth', 'special', 'special-youth', 'special youth', 'falconry', 'late', 'teal', 'free'])
const SPECIAL_KEYWORDS = /youth|veteran|military|conservation.?order|falconry|only|late.?season|special/i

function classifySeason(season: Season): 'duck' | 'goose' | 'dove' | 'other' | 'special' {
  const n = `${season.name} ${season.seasonType || ''}`.toLowerCase()
  // Special seasons first — overrides everything
  if (SPECIAL_TYPES.has((season.seasonType || '').toLowerCase()) || SPECIAL_KEYWORDS.test(season.name)) {
    return 'special'
  }
  if (/duck|teal|merganser|mallard|pintail|redhead|canvasback|scaup|bufflehead|widgeon|wigeon|shoveler|gadwall|divers?|harlequin|wood.?duck|mottled|dusky/.test(n)) return 'duck'
  if (/goose|geese|crane|specklebelly|whitefront|white.?front|brant|light.?geese|dark.?geese/.test(n)) return 'goose'
  if (/dove|pigeon/.test(n)) return 'dove'
  return 'other'
}

const GROUP_CONFIG: { key: 'duck' | 'goose' | 'dove' | 'other' | 'special'; label: string }[] = [
  { key: 'duck',    label: 'Ducks' },
  { key: 'goose',   label: 'Geese & Cranes' },
  { key: 'dove',    label: 'Dove & Pigeon' },
  { key: 'other',   label: 'Other Migratory' },
  { key: 'special', label: 'Special Seasons' },
]

// ─── Season dates ────────────────────────────────────────────────────────────

// A season start/end is a calendar day — the day the regulation prints — not an instant.
// Handing the wire value straight to Date parses it as UTC midnight, which is the *previous*
// day everywhere west of Greenwich: a Sep 1 opener reads "Aug 31" to a hunter in Texas.
// Season dates carry legal weight, so read the leading YYYY-MM-DD and build local midnight
// from those three numbers.
//
// The pattern is deliberately not anchored at the tail. Drizzle's timestamp mapper hands
// Fastify a UTC-midnight Date, so the API serializes '2026-09-01T00:00:00.000Z' — this page
// never sees the bare '2026-09-01' form, and a trailing `$` would fix nothing while looking
// correct. A Date arrives untouched: a caller passing one has already localized it.
//
// This duplicates the rule in packages/shared deliberately. apps/web doesn't depend on that
// package, and its formatDateRange renders a different string than the one below.
function toCalendarDate(value: string | Date): Date {
  if (value instanceof Date) return value

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return new Date(value)

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function isOpenOn(season: Season, day: Date): boolean {
  return toCalendarDate(season.startDate) <= day && day <= toCalendarDate(season.endDate)
}

function todayLocal(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function SeasonTable({ seasons }: { seasons: Season[] }) {
  const bagFmt = (bl: unknown) => {
    const b = bl as { daily?: number; possession?: number; season?: number } | null
    if (!b) return '-'
    const parts = []
    if (b.daily != null) parts.push(`${b.daily}/day`)
    if (b.possession != null) parts.push(`${b.possession} possession`)
    if (b.season != null) parts.push(`${b.season}/season`)
    return parts.length ? parts.join(', ') : '-'
  }
  const today = todayLocal()
  // In date order, so a split's first part comes before its second
  const sorted = [...seasons].sort((a, b) => toCalendarDate(a.startDate).getTime() - toCalendarDate(b.startDate).getTime())
  return (
    <table className="w-full text-sm">
      <thead style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
        <tr>
          <th className="text-left p-3 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Season</th>
          <th className="text-left p-3 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Dates</th>
          <th className="text-left p-3 font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>Bag Limit</th>
          <th className="text-left p-3 font-medium hidden md:table-cell" style={{ color: `rgb(var(--color-text-secondary))` }}>Restrictions</th>
        </tr>
      </thead>
      <tbody className="divide-y" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
        {sorted.map(season => {
          const open = isOpenOn(season, today)
          return (
            <tr key={season.id} className={open ? 'bg-forest-50 dark:bg-forest-900/20' : undefined}>
              <td className="p-3 font-medium align-top" style={{ color: `rgb(var(--color-text-primary))` }}>
                {season.name}
                {open && (
                  <span className="ml-2 inline-block text-xs font-semibold rounded px-1.5 py-0.5 bg-forest-100 dark:bg-forest-900/50 text-forest-700 dark:text-forest-300">
                    Open today
                  </span>
                )}
                {/* On a phone the Restrictions column is hidden; species limits still matter */}
                {season.restrictions && (
                  <p className="md:hidden mt-1 text-xs font-normal" style={{ color: `rgb(var(--color-text-secondary))` }}>
                    {season.restrictions}
                  </p>
                )}
              </td>
              <td className="p-3 align-top sm:whitespace-nowrap" style={{ color: `rgb(var(--color-text-secondary))` }}>
                {toCalendarDate(season.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' – '}
                {toCalendarDate(season.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
              <td className="p-3 align-top" style={{ color: `rgb(var(--color-text-secondary))` }}>
                {season.bySpecies ? (
                  <ul className="space-y-0.5">
                    {season.bySpecies.map(b => <li key={b.species}><span style={{ color: `rgb(var(--color-text-primary))` }}>{b.species}:</span> {bagFmt(b.bagLimit)}</li>)}
                  </ul>
                ) : bagFmt(season.bagLimit)}
              </td>
              <td className="p-3 align-top hidden md:table-cell" style={{ color: `rgb(var(--color-text-secondary))` }}>{season.restrictions || '-'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const isStatewideZone = (z: string) => /statewide/i.test(z)

/** The state's zones, statewide left out ("North Zone", "South Zone") */
function zonesOf(seasons: Season[]): string[] {
  const all = new Set<string>()
  for (const s of seasons) for (const z of s.units ?? []) if (!isStatewideZone(z)) all.add(z)
  return [...all].sort()
}

/** The seasons that apply in a zone: its own plus the statewide ones. No zone, all of them */
function seasonsInZone(seasons: Season[], zone: string): Season[] {
  if (!zone) return seasons
  return seasons.filter(s => !s.units || s.units.length === 0 || s.units.some(z => z === zone || isStatewideZone(z)))
}

/** A bag limit inside the season ("Scaup (first 45 days)"), not a season of its own */
const SUB_LIMIT = /^(scaup|pintail|canvasback|mallard|redhead)\b/i

/** Regular seasons, the ones a hunter plans around: no falconry, youth days or bag sub-limits */
function isMainSeason(s: Season): boolean {
  return classifySeason(s) !== 'special' && !SUB_LIMIT.test(s.name)
}

/** Which season groups open on arrival: the ones in season today, else the next to open */
function groupsInSeason(seasons: Season[], today: Date): Set<string> {
  const main = seasons.filter(isMainSeason)
  const open = main.filter(s => isOpenOn(s, today))
  if (open.length > 0) return new Set(open.map(classifySeason))
  const next = main
    .filter(s => toCalendarDate(s.startDate) > today)
    .sort((a, b) => toCalendarDate(a.startDate).getTime() - toCalendarDate(b.startDate).getTime())[0]
  return new Set(next ? [classifySeason(next)] : [])
}

// ─── Zone: remembered, in the link, found from where you stand, shown on the map ───

const ZONE_SHAPES_URL = '/data/waterfowl-zones-2026.json'
const zoneKey = (state: string) => `huntstack-reg-zone-${state.toUpperCase()}`

type ZoneShape = {
  properties: { id: string; state: string; duckZone: string; gooseZone: string; duckUnits?: string[]; gooseUnits?: string[] }
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] }
}
let zoneShapes: Promise<ZoneShape[]> | null = null
/** The Map page's zone shapes (one file, fetched once and only when needed) */
function loadZoneShapes(): Promise<ZoneShape[]> {
  zoneShapes ??= fetch(ZONE_SHAPES_URL)
    .then(r => { if (!r.ok) throw new Error('zone shapes'); return r.json() })
    .then(d => d.features as ZoneShape[])
    .catch(e => { zoneShapes = null; throw e })
  return zoneShapes
}

function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function inShape(lng: number, lat: number, g: ZoneShape['geometry']): boolean {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  return polys.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some(h => inRing(lng, lat, h)))
}

/** The picker's name for a shape: its duck zone, else the first of its units the seasons use */
function zoneNameFor(shape: ZoneShape, zones: string[]): string {
  const p = shape.properties
  return [p.duckZone, ...(p.duckUnits ?? []), p.gooseZone, ...(p.gooseUnits ?? [])].find(z => zones.includes(z)) ?? ''
}

/** The map shape for a picked zone, so "Show on map" opens that zone */
function shapeIdFor(shapes: ZoneShape[], state: string, zone: string): string | null {
  const mine = shapes.filter(s => s.properties.state === state.toUpperCase())
  return (mine.find(s => s.properties.duckZone === zone)
    ?? mine.find(s => s.properties.gooseZone === zone)
    ?? mine.find(s => [...(s.properties.duckUnits ?? []), ...(s.properties.gooseUnits ?? [])].includes(zone)))?.properties.id ?? null
}

function ZoneControls({ state, stateName, zones, zone, onZone }: {
  state: string; stateName: string; zones: string[]; zone: string; onZone: (z: string) => void
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [mapId, setMapId] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setMapId(null)
    if (zone) loadZoneShapes().then(shapes => { if (live) setMapId(shapeIdFor(shapes, state, zone)) }).catch(() => {})
    return () => { live = false }
  }, [state, zone])
  if (zones.length < 2) return null

  function locate() {
    if (!navigator.geolocation) { setStatus('Your browser does not share location.'); return }
    setStatus('Finding you…')
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { longitude: lng, latitude: lat } = pos.coords
        const shapes = await loadZoneShapes()
        const here = shapes.find(s => s.properties.state === state.toUpperCase() && inShape(lng, lat, s.geometry))
        const name = here ? zoneNameFor(here, zones) : ''
        if (!name) { setStatus(`You're not in ${stateName}. Pick a zone instead.`); return }
        onZone(name)
        setStatus(`You're in ${name}.`)
      } catch {
        setStatus("Couldn't load the zone map. Pick a zone instead.")
      }
    }, err => {
      setStatus(err.code === err.PERMISSION_DENIED ? 'Location is blocked. Pick a zone instead.' : "Couldn't find you. Pick a zone instead.")
    }, { timeout: 15000, maximumAge: 10 * 60_000 })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="season-zone" className="text-sm font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>
          Your zone
        </label>
        <select id="season-zone" className="input w-auto max-w-full" value={zone} onChange={e => { setStatus(null); onZone(e.target.value) }}>
          <option value="">All zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <button type="button" onClick={locate} className="chip min-h-10 inline-flex items-center gap-1.5">
          <LocateFixed className="w-4 h-4" /> Use my location
        </button>
        {zone && mapId && (
          <Link to={`/map?zone=${encodeURIComponent(mapId)}`} className="chip min-h-10 inline-flex items-center gap-1.5">
            <MapIcon className="w-4 h-4" /> Show on map
          </Link>
        )}
      </div>
      {status && <p className="text-xs" role="status" style={{ color: `rgb(var(--color-text-tertiary))` }}>{status}</p>}
    </div>
  )
}

// ─── What to buy: the four things a duck hunter carries ───

type Residency = 'resident' | 'nonresident'
const NONRES = /non-?resident/i
const NOT_STANDARD = /youth|senior|65\+|lifetime|military|veteran|disabled|\d+-day|\d+ days?\b|temporary|daily|native|combo|combination|package|fishing|preserve|3-year|collector|wma|breeder|endorsement \(|apprentice/i

function priceFor(l: License, who: Residency): number | null {
  return who === 'resident' ? l.priceResident : l.priceNonResident
}
/** Can this residency buy it? A price for them says yes; otherwise the name and the flag decide */
function forWho(l: License, who: Residency): boolean {
  if (priceFor(l, who) != null) return true
  if (who === 'resident') return !NONRES.test(l.name)
  return !l.isResidentOnly && !/^resident\b/i.test(l.name)
}
function pick(licenses: License[], who: Residency, test: (l: License) => boolean): License | null {
  const ok = licenses.filter(l => test(l) && forWho(l, who) && !NOT_STANDARD.test(l.name))
  // The cheapest priced one: a state lists its all-game license beside the small game license that
  // covers ducks (AR $410 vs $110), and the rows come back in no fixed order
  const priced = ok.filter(l => priceFor(l, who) != null).sort((a, b) => priceFor(a, who)! - priceFor(b, who)!)
  return priced[0] ?? ok[0] ?? null
}

const BUY_SLOTS: { key: string; label: string; test: (l: License) => boolean }[] = [
  { key: 'license', label: 'Hunting license', test: l => /^(base|license)$/.test(l.licenseType) && /hunting|sportsman|small game|conservation license/i.test(l.name) && !/waterfowl|stamp|hip\b/i.test(l.name) },
  // MO calls it the Migratory Bird Hunting Permit, IA the Migratory Game Bird Fee; NM has no
  // waterfowl stamp, and its required extra is the Habitat Management and Access Validation
  { key: 'state', label: 'State waterfowl stamp or fee', test: l => !/federal|harvest|\bhip\b/i.test(l.name) && /waterfowl (stamp|license|permit|hunting license)|state duck stamp|migratory game bird (endorsement|fee)|migratory bird hunting permit|habitat management and access validation|^waterfowl license$/i.test(l.name) },
  { key: 'hip', label: 'HIP certification', test: l => /\bhip\b|harvest information/i.test(l.name) },
  { key: 'federal', label: 'Federal Duck Stamp', test: l => /federal/i.test(l.name) && /duck stamp|migratory bird hunting/i.test(l.name) },
]

/**
 * What a duck hunter 16 or older buys, for a resident or a non-resident: hunting license, state
 * waterfowl license or stamp, HIP, federal stamp, from this state's license rows. A price the data
 * does not have is said so, never guessed, and the total says "at least" when one is missing.
 */
function WhatToBuy({ licenses, stateName, agencyUrl }: { licenses: License[]; stateName: string; agencyUrl: string | null }) {
  const [who, setWho] = useState<Residency>('nonresident')
  const rows = BUY_SLOTS.map(slot => ({ slot, lic: pick(licenses, who, slot.test) }))
  if (rows.filter(r => r.lic).length < 2) return null
  const known = rows.filter(r => r.lic && priceFor(r.lic, who) != null)
  const total = known.reduce((sum, r) => sum + (priceFor(r.lic!, who) ?? 0), 0)
  const missing = rows.length - known.length
  const money = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`
  const dim = { color: `rgb(var(--color-text-tertiary))` }
  const ink = { color: `rgb(var(--color-text-primary))` }
  return (
    <section id="what-to-buy" aria-labelledby="what-to-buy-h" className="card p-5 mb-4 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 id="what-to-buy-h" className="text-lg font-semibold" style={ink}>What you need to hunt ducks in {stateName}</h3>
        <div role="radiogroup" aria-label="Residency" className="flex gap-2">
          {(['resident', 'nonresident'] as const).map(r => (
            <button key={r} type="button" role="radio" aria-checked={who === r} onClick={() => setWho(r)}
              className={`chip min-h-10 ${who === r ? 'chip-on' : ''}`}>
              {r === 'resident' ? 'Resident' : 'Non-resident'}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
        {rows.map(({ slot, lic }) => {
          const price = lic ? priceFor(lic, who) : null
          return (
            <li key={slot.key} className="py-2.5 flex items-start justify-between gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={dim}>{slot.label}</p>
                <p style={ink}>{lic ? lic.name : 'Not in our data. Check with the state'}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-medium" style={price != null ? ink : dim}>{lic ? (price === 0 ? 'Free' : price != null ? money(price) : 'Price not listed') : '—'}</p>
                {lic?.purchaseUrl && (
                  <a href={lic.purchaseUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-500 hover:underline inline-flex items-center gap-1">
                    Buy <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="pt-3 mt-1 flex flex-wrap items-baseline justify-between gap-2" style={{ borderTop: `1px solid rgb(var(--color-border-primary))` }}>
        <p className="font-semibold" style={ink}>
          {known.length === 0 ? 'Prices not listed' : missing > 0 ? `At least ${money(total)}` : `Total ${money(total)}`}
        </p>
        <p className="text-xs" style={dim}>
          {missing > 0 && `${missing} price${missing > 1 ? 's' : ''} not in our data. `}
          Ages 16 and up. Youth, senior and lifetime licenses differ.{' '}
          {agencyUrl && <a href={agencyUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline">Confirm with the state</a>}
        </p>
      </div>
    </section>
  )
}

function ZonePicker({ zones, zone, onZone }: { zones: string[]; zone: string; onZone: (z: string) => void }) {
  if (zones.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="season-zone" className="text-sm font-medium" style={{ color: `rgb(var(--color-text-secondary))` }}>
        Your zone
      </label>
      <select id="season-zone" className="input w-auto max-w-full" value={zone} onChange={e => onZone(e.target.value)}>
        <option value="">All zones</option>
        {zones.map(z => <option key={z} value={z}>{z}</option>)}
      </select>
    </div>
  )
}

/** "today", "tomorrow", "in 3 days" */
function inDays(today: Date, day: Date): string {
  const n = Math.round((day.getTime() - today.getTime()) / 86_400_000)
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`
}
/** Days left through the last day, counting today */
function daysLeftThrough(today: Date, last: Date): string {
  const n = Math.round((last.getTime() - today.getTime()) / 86_400_000) + 1
  return n <= 1 ? 'last day' : `${n} days left`
}
const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function bagLine(bl: unknown): string | null {
  const b = bl as { daily?: number; possession?: number } | null
  if (!b || b.daily == null) return null
  return `${b.daily} a day${b.possession != null ? ` (${b.possession} in possession)` : ''}`
}

/** The hunting license a duck hunter buys, resident and non-resident: What you need to buy's pick */
function baseLicense(licenses: License[]): { res: number | null; nonres: number | null } | null {
  const slot = BUY_SLOTS[0]
  const r = pick(licenses, 'resident', slot.test)
  const n = pick(licenses, 'nonresident', slot.test)
  const res = r ? priceFor(r, 'resident') : null
  const nonres = n ? priceFor(n, 'nonresident') : null
  return res == null && nonres == null ? null : { res, nonres }
}

/**
 * The answer most visitors came for, above everything else: what is open today, what opens or
 * closes next, the duck limit and hours, and what the basic license costs. This season only.
 */
const OPEN_SHOWN = 6

function SeasonSummary({ state, stateName, seasons, licenses, zone, zones, onZone }: {
  state: string; stateName: string; seasons: Season[]; licenses: License[]; zone: string; zones: string[]; onZone: (z: string) => void
}) {
  const today = todayLocal()
  // Each season once (mergeSpeciesRows already joins the per-species rows; this is a safety net)
  const unique = [...new Map(seasons.map(s => [`${s.name}|${s.startDate}|${s.endDate}`, s])).values()]
  const main = unique.filter(isMainSeason)
  const openToday = main.filter(s => isOpenOn(s, today))
  const openNames = [...new Set(openToday.map(s => s.name))]
  const changes = [
    ...openToday.map(s => ({ s, kind: 'closes' as const, day: toCalendarDate(s.endDate) })),
    ...main.filter(s => toCalendarDate(s.startDate) > today).map(s => ({ s, kind: 'opens' as const, day: toCalendarDate(s.startDate) })),
  ].sort((a, b) => a.day.getTime() - b.day.getTime()).slice(0, 3)

  const ducks = main.filter(s => classifySeason(s) === 'duck' && !/teal/i.test(s.name))
  const duck = ducks.find(s => isOpenOn(s, today))
    ?? ducks.filter(s => toCalendarDate(s.startDate) > today).sort((a, b) => toCalendarDate(a.startDate).getTime() - toCalendarDate(b.startDate).getTime())[0]
    ?? ducks[0]
  const duckBag = duck ? bagLine(duck.bagLimit) : null
  const hours = duck ? formatShootingHours(duck.shootingHours) : '—'
  const license = baseLicense(licenses)
  const money = (n: number | null) => n == null ? null : `$${n % 1 === 0 ? n : n.toFixed(2)}`

  const label = 'text-xs font-semibold uppercase tracking-wide'
  const labelStyle = { color: `rgb(var(--color-text-tertiary))` }
  const body = { color: `rgb(var(--color-text-primary))` }
  return (
    <section aria-labelledby="season-summary" className="card p-5 mb-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="season-summary" className="text-lg font-semibold" style={body}>
          {zone ? `Today in ${zone}` : 'Today'} <span className="text-sm font-normal" style={labelStyle}>{fmtDay(today)}</span>
        </h2>
        <ZoneControls state={state} stateName={stateName} zones={zones} zone={zone} onZone={onZone} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className={label} style={labelStyle}>Open today</p>
          {openToday.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-sm font-medium text-forest-700 dark:text-forest-400">
              {openNames.slice(0, OPEN_SHOWN).map(n => <li key={n}>{n}</li>)}
              {openNames.length > OPEN_SHOWN && (
                <li className="font-normal" style={labelStyle}>
                  and {openNames.length - OPEN_SHOWN} more{zones.length > 1 && !zone ? '. Pick your zone to narrow it' : ''}
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-sm" style={body}>Nothing is open{zone ? ` in ${zone}` : ''} today.</p>
          )}
        </div>
        {changes.length > 0 && (
          <div>
            <p className={label} style={labelStyle}>Coming up</p>
            <ul className="mt-1 space-y-1 text-sm" style={body}>
              {changes.map(({ s, kind, day }) => (
                <li key={`${kind}|${s.id}`}>
                  <span className="font-medium">{s.name}</span>{' '}
                  {kind === 'opens'
                    ? <>opens {fmtDay(day)} <span style={labelStyle}>({inDays(today, day)})</span></>
                    : <>runs through {fmtDay(day)} <span style={labelStyle}>({daysLeftThrough(today, day)})</span></>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {duck && (duckBag || hours !== '—') && (
          <div>
            <p className={label} style={labelStyle}>Ducks</p>
            {duckBag && <p className="mt-1 text-sm" style={body}><span className="font-medium">{duckBag}</span></p>}
            {hours !== '—' && <p className="text-sm" style={body}>Shooting hours: {hours}</p>}
            <p className="text-xs mt-0.5" style={labelStyle}>From {duck.name}</p>
          </div>
        )}
        {license && (
          <div>
            <p className={label} style={labelStyle}>Hunting license</p>
            <p className="mt-1 text-sm" style={body}>
              {[money(license.res) && `${money(license.res)} resident`, money(license.nonres) && `${money(license.nonres)} non-resident`].filter(Boolean).join(' · ')}
            </p>
            <a href="#what-to-buy" className="text-xs text-accent-500 hover:underline">What you need to buy</a>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Season timeline and calendar file ───

/** The rows a hunter plans around, in date order within each group: falconry and bag sub-limits left out */
function timelineSeasons(seasons: Season[]): Season[] {
  const unique = [...new Map(seasons.map(s => [`${s.name}|${s.startDate}|${s.endDate}`, s])).values()]
  return unique.filter(s => !SUB_LIMIT.test(s.name) && !/falconry/i.test(`${s.name} ${s.seasonType ?? ''}`))
}
/** "Regular Duck Season (Split 2) - East Zone" -> "Regular Duck Season - East Zone": a split shares its row */
const rowName = (name: string) => name.replace(/\s*\((split|segment|part)\s*\d+\)/i, '').trim()

const BAR_REGULAR = 'bg-[#2a78d6] dark:bg-[#3987e5]'
const BAR_SPECIAL = 'bg-[#eda100] dark:bg-[#c98500]'
const DAY_MS = 86_400_000

/**
 * One row per season, splits on the same row, across the season's months, with a line at today.
 * Each bar says its dates on hover and to a screen reader; the tables below carry the same dates.
 */
function SeasonTimeline({ seasons }: { seasons: Season[] }) {
  const today = todayLocal()
  const rows = useMemo(() => {
    const byRow = new Map<string, { name: string; group: number; special: boolean; parts: Season[] }>()
    for (const s of timelineSeasons(seasons)) {
      const key = rowName(s.name)
      const cls = classifySeason(s)
      const row = byRow.get(key) ?? { name: key, group: GROUP_CONFIG.findIndex(g => g.key === cls), special: cls === 'special', parts: [] }
      row.parts.push(s)
      byRow.set(key, row)
    }
    const first = (r: { parts: Season[] }) => Math.min(...r.parts.map(p => toCalendarDate(p.startDate).getTime()))
    return [...byRow.values()].sort((a, b) => a.group - b.group || first(a) - first(b))
  }, [seasons])
  if (rows.length === 0) return null

  const starts = rows.flatMap(r => r.parts.map(p => toCalendarDate(p.startDate)))
  const ends = rows.flatMap(r => r.parts.map(p => toCalendarDate(p.endDate)))
  const lo = new Date(Math.min(...starts.map(d => d.getTime())))
  const hi = new Date(Math.max(...ends.map(d => d.getTime())))
  const from = new Date(lo.getFullYear(), lo.getMonth(), 1)
  const to = new Date(hi.getFullYear(), hi.getMonth() + 1, 1)
  const span = to.getTime() - from.getTime()
  const pct = (d: Date) => ((d.getTime() - from.getTime()) / span) * 100
  const months: Date[] = []
  for (let m = new Date(from); m < to; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m)
  const todayIn = today >= from && today < to
  const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const dim = { color: `rgb(var(--color-text-tertiary))` }
  const ink = { color: `rgb(var(--color-text-primary))` }
  const grid = { backgroundColor: `rgb(var(--color-border-primary))` }
  const hasSpecial = rows.some(r => r.special)

  const Gridlines = () => (
    <>
      {months.slice(1).map(m => <span key={m.getTime()} aria-hidden className="absolute top-0 bottom-0 w-px" style={{ ...grid, left: `${pct(m)}%` }} />)}
      {todayIn && <span aria-hidden className="absolute top-0 bottom-0 w-0.5 bg-red-500 dark:bg-red-400" style={{ left: `${pct(today)}%` }} />}
    </>
  )

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs" style={dim}>
        <span className="inline-flex items-center gap-1.5"><span className={`inline-block w-3 h-2 rounded-sm ${BAR_REGULAR}`} /> Season</span>
        {hasSpecial && <span className="inline-flex items-center gap-1.5"><span className={`inline-block w-3 h-2 rounded-sm ${BAR_SPECIAL}`} /> Youth, conservation order and other special days</span>}
        {todayIn && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-0.5 h-3 bg-red-500 dark:bg-red-400" /> Today, {short(today)}</span>}
      </div>
      {/* Month axis */}
      <div className="grid grid-cols-1 sm:grid-cols-[16rem_1fr] gap-x-3">
        <span className="hidden sm:block" />
        <div className="relative h-5 text-[11px]" style={dim}>
          {months.map(m => (
            <span key={m.getTime()} className="absolute top-0 pl-1" style={{ left: `${pct(m)}%` }}>
              {m.toLocaleDateString('en-US', { month: 'short' })}
            </span>
          ))}
        </div>
      </div>
      <ul className="space-y-1.5 sm:space-y-1">
        {rows.map(r => (
          <li key={r.name} className="grid grid-cols-1 sm:grid-cols-[16rem_1fr] gap-x-3 items-center">
            <span className="text-xs sm:truncate" style={ink} title={r.name}>{r.name}</span>
            <div className="relative h-4">
              <Gridlines />
              {r.parts.map(p => {
                const a = toCalendarDate(p.startDate), b = toCalendarDate(p.endDate)
                const when = a.getTime() === b.getTime() ? short(a) : `${short(a)} – ${short(b)}`
                return (
                  <span key={p.id} role="img" tabIndex={0} aria-label={`${p.name}: ${when}`} title={`${p.name}\n${when}`}
                    className={`absolute top-0.5 bottom-0.5 rounded focus:outline-none focus:ring-2 focus:ring-accent-500 ${r.special ? BAR_SPECIAL : BAR_REGULAR}`}
                    style={{ left: `${pct(a)}%`, width: `max(4px, calc(${((b.getTime() + DAY_MS - a.getTime()) / span) * 100}% - 2px))` }} />
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** iCalendar text: escape, and fold lines at 75 octets */
const icsText = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
function icsFold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0 }
    cur += ch; size += n
  }
  out.push(cur)
  return out.join('\r\n ')
}
const icsDate = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

/**
 * Opening days and last days as all-day events, from today on (the whole season when it is
 * over), each with its limit and hours, a reminder the day before an opener, and a link back.
 */
function buildSeasonIcs(seasons: Season[], opts: { state: string; stateName: string; zone: string; agency: string | null }): { text: string; count: number } {
  const today = todayLocal()
  const page = `https://huntstack.net/regulations/${opts.state.toUpperCase()}${opts.zone ? `?zone=${encodeURIComponent(opts.zone)}` : ''}`
  type Ev = { day: Date; title: string; uid: string; detail: string; opener: boolean }
  const all: Ev[] = []
  for (const s of timelineSeasons(seasons)) {
    const a = toCalendarDate(s.startDate), b = toCalendarDate(s.endDate)
    const bag = bagLine(s.bagLimit)
    const hours = formatShootingHours(s.shootingHours)
    const detail = [
      `${s.name}: ${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${b.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
      bag && `Limit: ${bag}.`,
      hours !== '—' && `Shooting hours: ${hours}.`,
      `Confirm with ${opts.agency ?? `the ${opts.stateName} wildlife agency`} before you hunt.`,
      page,
    ].filter(Boolean).join('\n')
    if (a.getTime() === b.getTime()) {
      all.push({ day: a, title: s.name, uid: `${s.id}-day`, detail, opener: true })
    } else {
      all.push({ day: a, title: `Opens: ${s.name}`, uid: `${s.id}-open`, detail, opener: true })
      all.push({ day: b, title: `Last day: ${s.name}`, uid: `${s.id}-close`, detail, opener: false })
    }
  }
  const ahead = all.filter(e => e.day >= today)
  const events = (ahead.length > 0 ? ahead : all).sort((x, y) => x.day.getTime() - y.day.getTime())
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HuntStack//Season dates//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`${opts.stateName}${opts.zone ? ` ${opts.zone}` : ''} waterfowl seasons`)}`,
  ]
  for (const e of events) {
    const next = new Date(e.day.getFullYear(), e.day.getMonth(), e.day.getDate() + 1)
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@huntstack.net`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.day)}`, `DTEND;VALUE=DATE:${icsDate(next)}`,
      `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.detail)}`, `URL:${page}`, 'TRANSP:TRANSPARENT')
    if (e.opener) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, 'TRIGGER:-PT12H', 'END:VALARM')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return { text: lines.map(icsFold).join('\r\n') + '\r\n', count: events.length }
}

function AddToCalendar({ seasons, state, stateName, zone, zones, agency, year }: {
  seasons: Season[]; state: string; stateName: string; zone: string; zones: string[]; agency: string | null; year: number
}) {
  const [note, setNote] = useState<string | null>(null)
  function download() {
    const { text, count } = buildSeasonIcs(seasons, { state, stateName, zone, agency })
    const slug = (zone || (zones.length > 1 ? 'all-zones' : 'statewide')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `huntstack-${state.toLowerCase()}-${slug}-${year}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNote(`${count} dates saved${zone ? ` for ${zone}` : zones.length > 1 ? ' for every zone. Pick your zone for fewer' : ''}.`)
  }
  return (
    <div className="flex flex-col items-start sm:items-end gap-1">
      <button type="button" onClick={download} className="chip min-h-10 inline-flex items-center gap-1.5">
        <CalendarPlus className="w-4 h-4" /> Add to calendar
      </button>
      {note && <p className="text-xs" role="status" style={{ color: `rgb(var(--color-text-tertiary))` }}>{note}</p>}
    </div>
  )
}

// ─── Search one state's rules, seasons and licenses ───

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const searchWords = (q: string) => q.toLowerCase().split(/\s+/).filter(w => w.length >= 2)

// Words a hunter types that the rules spell another way. Each typed word matches any of its group
const SAME_AS: string[][] = [
  ['steel', 'nontoxic', 'non-toxic', 'bismuth', 'tungsten'],
  ['boat', 'boats', 'vessel', 'motor', 'outboard'],
  ['bait', 'baiting', 'baited'],
  ['call', 'calls', 'caller', 'callers'],
  ['blind', 'blinds'],
  ['dog', 'dogs', 'retriever'],
  ['hours', 'sunrise', 'sunset'],
  ['limit', 'limits', 'bag', 'possession'],
  ['kid', 'kids', 'youth', 'junior'],
]
/** What a typed word matches: itself, its singular, and its group above */
function wordAlts(w: string): string[] {
  const singular = w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w
  const group = SAME_AS.find(g => g.includes(w) || g.includes(singular)) ?? []
  return [...new Set([singular, ...group])]
}

/** The words wrapped in <mark>, the rest left as text */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>
  const re = new RegExp(`\\b(${words.flatMap(wordAlts).sort((a, b) => b.length - a.length).map(escapeRe).join('|')})`, 'gi')
  return <>{text.split(re).map((part, i) => i % 2 === 1
    ? <mark key={i} className="rounded px-0.5 bg-amber-200 text-earth-900 dark:bg-amber-400/30 dark:text-inherit">{part}</mark>
    : part)}</>
}
/** About 220 characters around the first match, so a long rule shows where the word is */
function snippet(text: string, words: string[]): string {
  const lower = text.toLowerCase()
  const at = Math.min(...words.map(w => lower.search(wordRe(w))).filter(i => i >= 0))
  if (!Number.isFinite(at) || text.length <= 220) return text.length <= 220 ? text : `${text.slice(0, 217)}…`
  const from = Math.max(0, at - 80)
  const piece = text.slice(from, from + 220)
  return `${from > 0 ? '…' : ''}${piece}${from + 220 < text.length ? '…' : ''}`
}
/** A typed word found at the start of a word in the text ("hip" is not inside "shipment") */
const wordRe = (w: string) => new RegExp(`\\b(${wordAlts(w).map(escapeRe).join('|')})`, 'i')
const matchesAll = (hay: string, words: string[]) => words.every(w => wordRe(w).test(hay))

function SearchResults({ query, stateName, regs, seasons, licenses, formatCategory, onClear }: {
  query: string; stateName: string; regs: Regulation[]; seasons: Season[]; licenses: License[]
  formatCategory: (c: string) => string; onClear: () => void
}) {
  const words = searchWords(query)
  const ruleHits = regs.filter(r => matchesAll(`${r.title} ${r.summary ?? ''} ${r.content} ${r.category}`, words))
  const seasonHits = uniqueSeasons(seasons).filter(x => matchesAll(`${x.name} ${x.restrictions ?? ''} ${(x.bagLimit as { notes?: string } | null)?.notes ?? ''} ${(x.units ?? []).join(' ')}`, words))
  const licenseHits = licenses.filter(l => matchesAll(`${l.name} ${l.description ?? ''} ${l.licenseType}`, words))
  const total = ruleHits.length + seasonHits.length + licenseHits.length
  const ink = { color: `rgb(var(--color-text-primary))` }
  const sub = { color: `rgb(var(--color-text-secondary))` }
  const dim = { color: `rgb(var(--color-text-tertiary))` }
  const Heading = ({ children, n }: { children: string; n: number }) => (
    <h3 className="text-sm font-semibold mb-2" style={ink}>{children} <span className="font-normal" style={dim}>({n})</span></h3>
  )
  return (
    <section aria-live="polite" className="mb-8 space-y-6">
      <p className="text-sm" style={sub}>
        {total === 0 ? <>Nothing in our {stateName} data matches “{query.trim()}”.</> : <>{total} match{total === 1 ? '' : 'es'} for “{query.trim()}”.</>}{' '}
        <button type="button" onClick={onClear} className="text-accent-500 hover:underline">Clear search</button>
      </p>
      {/* Our rule text is a summary; the AI also reads the agency's documents and the web */}
      <p className="text-sm" style={sub}>
        <Link to={`/chat?q=${encodeURIComponent(`${stateName} waterfowl hunting: ${query.trim()}`)}`} className="inline-flex items-center gap-1.5 text-accent-500 hover:underline">
          <MessageSquare className="w-4 h-4" /> Ask AI about “{query.trim()}” in {stateName}
        </Link>
      </p>
      {ruleHits.length > 0 && (
        <div>
          <Heading n={ruleHits.length}>Rules</Heading>
          <ul className="card divide-y" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
            {ruleHits.map(r => (
              <li key={r.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-medium text-sm" style={ink}><Highlight text={r.title} words={words} /></p>
                  {r.sourceUrl && (
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline text-xs flex items-center gap-1 flex-shrink-0">
                      Source <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={dim}>{formatCategory(r.category)}</p>
                <p className="text-sm mt-1" style={sub}><Highlight text={snippet(r.summary && matchesAll(r.summary, words.slice(0, 1)) ? r.summary : r.content || r.summary || '', words)} words={words} /></p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {seasonHits.length > 0 && (
        <div>
          <Heading n={seasonHits.length}>Seasons</Heading>
          <ul className="card divide-y" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
            {seasonHits.map(x => (
              <li key={x.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-medium" style={ink}><Highlight text={x.name} words={words} /></p>
                  <p style={sub}>{seasonRange(x)}{bagLine(x.bagLimit) ? ` · ${bagLine(x.bagLimit)}` : ''}</p>
                </div>
                {(x.restrictions || (x.bagLimit as { notes?: string } | null)?.notes) && (
                  <p className="mt-1" style={sub}><Highlight text={snippet(x.restrictions || (x.bagLimit as { notes?: string }).notes || '', words)} words={words} /></p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {licenseHits.length > 0 && (
        <div>
          <Heading n={licenseHits.length}>Licenses</Heading>
          <ul className="card divide-y" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
            {licenseHits.map(l => (
              <li key={l.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-medium" style={ink}><Highlight text={l.name} words={words} /></p>
                  <p style={sub}>{[l.priceResident != null && `${money(l.priceResident)} resident`, l.priceNonResident != null && `${money(l.priceNonResident)} non-resident`].filter(Boolean).join(' · ') || 'Price not listed'}</p>
                </div>
                {l.description && <p className="mt-1" style={sub}><Highlight text={snippet(l.description, words)} words={words} /></p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function SeasonGroups({ seasons, zone, openAll = false }: { seasons: Season[]; zone: string; openAll?: boolean }) {
  const inZone = useMemo(() => seasonsInZone(seasons, zone), [seasons, zone])
  const [openGroups, setOpenGroups] = useState<Set<string>>(() =>
    openAll ? new Set(GROUP_CONFIG.map(g => g.key)) : groupsInSeason(inZone, todayLocal()))
  // A newly picked zone opens what is in season there (adding to what is already open)
  const [shownZone, setShownZone] = useState(zone)
  if (shownZone !== zone) {
    setShownZone(zone)
    setOpenGroups(prev => new Set([...prev, ...groupsInSeason(inZone, todayLocal())]))
  }

  const grouped = useMemo(() => {
    const map: Record<string, Season[]> = { duck: [], goose: [], dove: [], other: [], special: [] }
    for (const s of inZone) map[classifySeason(s)].push(s)
    return map
  }, [inZone])

  const toggle = (key: string) => setOpenGroups(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <div className="space-y-3">
      {GROUP_CONFIG.map(({ key, label }) => {
        const group = grouped[key]
        if (!group || group.length === 0) return null
        const isOpen = openGroups.has(key)
        const isSpecial = key === 'special'
        return (
          <div key={key} className="card overflow-hidden">
            <button
              onClick={() => toggle(key)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-earth-50 dark:hover:bg-earth-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? '' : '-rotate-90'}`} style={{ color: `rgb(var(--color-text-tertiary))` }} />
                <span className={`font-semibold ${isSpecial ? 'text-amber-600 dark:text-amber-400' : ''}`} style={isSpecial ? undefined : { color: `rgb(var(--color-text-primary))` }}>
                  {label}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-earth-100 dark:bg-earth-800" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                  {group.length}
                </span>
              </div>
            </button>
            {isOpen && (
              <div style={{ borderTop: `1px solid rgb(var(--color-border-primary))` }}>
                <SeasonTable seasons={group} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
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

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const seasonRange = (x: Season) => {
  const a = toCalendarDate(x.startDate), b = toCalendarDate(x.endDate)
  return a.getTime() === b.getTime() ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`
}
/** The zone a season row belongs to, "" when statewide */
const zoneOf = (x: Season) => (x.units ?? []).find(z => !isStatewideZone(z)) ?? ''
const uniqueSeasons = (list: Season[]) => [...new Map(list.map(x => [`${x.name}|${x.startDate}|${x.endDate}`, x])).values()]

/** The regular duck season's splits, one line per zone: "North Zone: Oct 31 – Dec 29" */
const isRegularDuck = (x: Season) => isMainSeason(x) && classifySeason(x) === 'duck' && !/teal|dusky|mottled|wood duck|merganser/i.test(x.name)
function datesByZone(list: Season[]): string {
  const byZone = new Map<string, Season[]>()
  for (const x of uniqueSeasons(list)) byZone.set(zoneOf(x), [...(byZone.get(zoneOf(x)) ?? []), x])
  if (byZone.size === 0) return '—'
  return [...byZone.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([zone, parts]) => {
      const ranges = parts.sort((a, b) => toCalendarDate(a.startDate).getTime() - toCalendarDate(b.startDate).getTime()).map(seasonRange).join(', ')
      return zone && byZone.size > 1 ? `${zone}: ${ranges}` : ranges
    }).join('\n')
}
/** "6 a day", or "1–3 a day by zone" when the zones differ */
function dailyLimit(list: Season[]): string {
  const days = [...new Set(list.map(x => (x.bagLimit as { daily?: number } | null)?.daily).filter((n): n is number => n != null))].sort((a, b) => a - b)
  if (days.length === 0) return list.length ? 'No daily limit listed' : '—'
  return days.length === 1 ? `${days[0]} a day` : `${days[0]}–${days[days.length - 1]} a day, by season or zone`
}
const goose = (re: RegExp) => (list: Season[]) => list.filter(x => isMainSeason(x) && !/conservation/i.test(x.name) && re.test(x.name))
const darkGeese = goose(/canada|dark gee|dark goose/i)
const lightGeese = goose(/light gee|light goose|snow goose/i)
const whiteFronts = goose(/white-?front|specklebelly/i)

/** Open today, by group: "Ducks, Geese", with "(some zones)" when not every zone is open */
function openTodayLine(seasons: Season[]): string {
  const today = todayLocal()
  const main = uniqueSeasons(seasons).filter(isMainSeason)
  const zones = zonesOf(main)
  const parts: string[] = []
  for (const { key, label } of GROUP_CONFIG) {
    if (key === 'special') continue
    const group = main.filter(x => classifySeason(x) === key)
    const open = group.filter(x => isOpenOn(x, today))
    if (open.length === 0) continue
    const someZones = zones.length > 1 && zones.some(z => !seasonsInZone(open, z).some(x => classifySeason(x) === key))
    parts.push(`${label}${someZones ? ' (some zones)' : ''}`)
  }
  return parts.length ? parts.join(', ') : 'Nothing open'
}

const money = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`
function licenseCell(licenses: License[], who: Residency, slotKey: string): string {
  const slot = BUY_SLOTS.find(x => x.key === slotKey)!
  const lic = pick(licenses, who, slot.test)
  if (!lic) return 'Not in our data'
  const price = priceFor(lic, who)
  return price != null ? `${money(price)} (${lic.name})` : `Price not listed (${lic.name})`
}
/** The What-you-need-to-buy total for a non-resident: "At least" when a price is missing */
function nonResidentTotal(licenses: License[]): string {
  const picks = BUY_SLOTS.map(slot => pick(licenses, 'nonresident', slot.test))
  const prices = picks.map(l => (l ? priceFor(l, 'nonresident') : null))
  const known = prices.filter((n): n is number => n != null)
  if (known.length === 0) return 'Prices not listed'
  const total = known.reduce((a, b) => a + b, 0)
  return known.length === prices.length ? money(total) : `At least ${money(total)}`
}

function buildCompareRows(stateCodes: string[], dataMap: Record<string, StateCompareData>): CompareRow[] {
  function makeRow(label: string, getValue: (d: StateCompareData) => string): CompareRow {
    const values: Record<string, string> = {}
    for (const code of stateCodes) {
      const d = dataMap[code]
      values[code] = !d || d.loading ? '…' : d.error ? 'Error' : getValue(d)
    }
    const settled = Object.values(values).filter(v => v !== '…' && v !== 'Error' && v !== '—')
    return { label, values, differs: new Set(settled).size > 1 }
  }
  const duck = (d: StateCompareData) => d.seasons.filter(isRegularDuck)

  return [
    makeRow('Open today', d => d.seasons.length ? openTodayLine(d.seasons) : '—'),
    makeRow('Duck season', d => datesByZone(duck(d))),
    makeRow('Duck limit', d => dailyLimit(duck(d))),
    makeRow('Shooting hours', d => formatShootingHours(duck(d)[0]?.shootingHours)),
    makeRow('Teal season', d => datesByZone(d.seasons.filter(x => /teal/i.test(x.name) && !/youth/i.test(x.name)))),
    makeRow('Dark (Canada) goose limit', d => dailyLimit(darkGeese(d.seasons))),
    makeRow('White-fronted goose limit', d => dailyLimit(whiteFronts(d.seasons))),
    makeRow('Light goose limit', d => dailyLimit(lightGeese(d.seasons))),
    makeRow('Light goose conservation order', d => datesByZone(d.seasons.filter(x => /conservation order/i.test(x.name)))),
    makeRow('Hunting license, resident', d => licenseCell(d.licenses, 'resident', 'license')),
    makeRow('Hunting license, non-resident', d => licenseCell(d.licenses, 'nonresident', 'license')),
    makeRow('State waterfowl stamp or fee, non-resident', d => licenseCell(d.licenses, 'nonresident', 'state')),
    makeRow('Federal Duck Stamp', d => licenseCell(d.licenses, 'nonresident', 'federal')),
    makeRow('Total to hunt ducks, non-resident', d => nonResidentTotal(d.licenses)),
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
        api.getStateSeasons(code, { year: SEASON_YEAR }),
        api.getStateLicenses(code),
        loadSpeciesNames(),
      ]).then(([seasonsResp, licensesResp, speciesNames]) => {
        setDataMap(prev => ({
          ...prev,
          [code]: {
            seasons: mergeSpeciesRows(seasonsResp.seasons as Season[], speciesNames),
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
                        <a href={info.agencyUrl} target="_blank" rel="noopener noreferrer" className="p-2 -m-1 text-accent-500 hover:text-accent-600" aria-label={`${info.name} wildlife agency (opens in a new tab)`}>
                          <ExternalLink className="w-3.5 h-3.5" />
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
                      : <span className="whitespace-pre-line">{row.values[code]}</span>
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
        Highlighted rows have differing values across states. A price we don't have says so; nothing is guessed.
      </div>
    </div>
  )
}

// ─── State detail view (single state) ────────────────────────────────────────

function StateDetailView({ stateCode }: { stateCode: string }) {
  const navigate = useNavigate()
  // "?expand=all" (a state guide's "<State> regulations" link) opens every group on arrival
  const [searchParams, setSearchParams] = useSearchParams()
  const expandAll = searchParams.get('expand') === 'all'
  const [stateInfo, setStateInfo] = useState<StateInfo | null>(null)
  const [regs, setRegs] = useState<Regulation[]>([])
  const [seasonsList, setSeasonsList] = useState<Season[]>([])
  const [licensesList, setLicensesList] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedYear, setSelectedYear] = useState<number>(SEASON_YEAR)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedLicenseTypes, setExpandedLicenseTypes] = useState<Set<string>>(new Set())
  // "Is it open in my zone this weekend?" One zone for the summary and the season tables
  // From the link (?zone=), else the one last picked for this state; one not in the data is ignored
  const [pickedZone, setPickedZone] = useState(() => {
    const fromLink = searchParams.get('zone')
    if (fromLink) return fromLink
    try { return localStorage.getItem(zoneKey(stateCode)) ?? '' } catch { return '' }
  })
  const zones = useMemo(() => zonesOf(seasonsList), [seasonsList])
  const zone = zones.includes(pickedZone) ? pickedZone : ''
  const setZone = (z: string) => {
    setPickedZone(z)
    try { if (z) localStorage.setItem(zoneKey(stateCode), z); else localStorage.removeItem(zoneKey(stateCode)) } catch { /* not saved */ }
    setSearchParams(p => { const n = new URLSearchParams(p); if (z) n.set('zone', z); else n.delete('zone'); return n }, { replace: true })
  }
  const zoneSeasons = useMemo(() => seasonsInZone(seasonsList, zone), [seasonsList, zone])
  // "steel shot", "decoys": every rule, season and license, as you type
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const searching = searchWords(query).length > 0
  const changeQuery = (q: string) => {
    setQuery(q)
    setSearchParams(p => { const n = new URLSearchParams(p); if (q.trim()) n.set('q', q); else n.delete('q'); return n }, { replace: true })
  }

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
        const [regData, seasonsData, licensesData, speciesNames] = await Promise.all([
          api.getStateRegulations(stateCode, { year: selectedYear }),
          api.getStateSeasons(stateCode, { year: selectedYear }),
          api.getStateLicenses(stateCode),
          loadSpeciesNames(),
        ])
        setStateInfo(regData.state as StateInfo)
        setRegs(regData.regulations as Regulation[])
        setSeasonsList(mergeSpeciesRows(seasonsData.seasons as Season[], speciesNames))
        setLicensesList(licensesData.licenses as License[])
        if (expandAll) {
          setExpandedCategories(new Set((regData.regulations as Regulation[]).map(r => r.category)))
          setExpandedLicenseTypes(new Set((licensesData.licenses as License[]).map(l => l.licenseType || 'other')))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load state data')
      } finally {
        setLoading(false)
      }
    }
    setExpandedCategories(new Set())
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <h1 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-1">
            No regulations for {stateCode.toUpperCase()}
          </h1>
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
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ color: `rgb(var(--color-text-primary))` }}>
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

      {/* What is open now: this season only */}
      {selectedYear === SEASON_YEAR && seasonsList.length > 0 && (
        <SeasonSummary state={stateCode} stateName={stateName} seasons={zoneSeasons} licenses={licensesList} zone={zone} zones={zones} onZone={setZone} />
      )}

      {/* Search */}
      <div className="relative mb-4">
        <label htmlFor="state-search" className="sr-only">Search {stateName} rules, seasons and licenses</label>
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: `rgb(var(--color-text-tertiary))` }} />
        <input
          id="state-search"
          type="search"
          value={query}
          onChange={e => changeQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') changeQuery('') }}
          placeholder={`Search ${stateName} rules, seasons and licenses`}
          className="input w-full pl-9 min-h-11"
          autoComplete="off"
        />
      </div>
      {searching && (
        <SearchResults query={query} stateName={stateName} regs={regs} seasons={seasonsList} licenses={licensesList} formatCategory={formatCategory} onClear={() => changeQuery('')} />
      )}

      {/* Filters */}
      <div className={`flex flex-wrap items-center gap-3 mb-8 ${searching ? 'hidden' : ''}`}>
        <select
          value={selectedYear}
          onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedCategory('all') }}
          className="input w-auto min-h-10 font-medium"
        >
          {SEASON_YEAR_OPTIONS.map(y => (
            <option key={y} value={y}>{y}–{y + 1}</option>
          ))}
        </select>

        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`chip px-4 min-h-10 ${selectedCategory === cat ? 'chip-on' : ''}`}
              >
                {cat === 'all' ? 'All' : cat.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Seasons first: dates and limits are what most visitors came for */}
      {!searching && selectedCategory === 'all' && seasonsList.length > 0 && (
        <div className="space-y-4 mb-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
              Seasons{zone && <span className="text-base font-normal" style={{ color: `rgb(var(--color-text-tertiary))` }}> in {zone}</span>}
            </h2>
            <AddToCalendar seasons={zoneSeasons} state={stateCode} stateName={stateName} zone={zone} zones={zones} agency={stateInfo?.agencyName ?? null} year={selectedYear} />
          </div>
          {selectedYear !== SEASON_YEAR && <ZonePicker zones={zones} zone={zone} onZone={setZone} />}
          <SeasonTimeline seasons={zoneSeasons} />
          <SeasonGroups key={selectedYear} seasons={seasonsList} zone={zone} openAll={expandAll} />
        </div>
      )}

      {/* Regulations */}
      {!searching && filteredRegs.length > 0 && (
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
                    <span className="text-xs px-2 py-0.5 rounded-md bg-earth-100 dark:bg-earth-800" style={{ color: `rgb(var(--color-text-tertiary))` }}>
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

      {/* Licenses */}
      {!searching && (selectedCategory === 'all' || selectedCategory === 'licenses') && licensesList.length > 0 && (
        <div id="licenses" className="space-y-2 mb-8 scroll-mt-20">
          <h2 className="text-xl font-semibold mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>
            License Requirements <span className="text-sm font-normal ml-2" style={{ color: `rgb(var(--color-text-tertiary))` }}>({licensesList.length} total)</span>
          </h2>
          <WhatToBuy licenses={licensesList} stateName={stateName} agencyUrl={stateInfo?.licenseUrl ?? stateInfo?.agencyUrl ?? null} />
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
                    <span className="text-xs px-2 py-0.5 rounded-md bg-earth-100 dark:bg-earth-800" style={{ color: `rgb(var(--color-text-tertiary))` }}>
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
      {!searching && filteredRegs.length === 0 && seasonsList.length === 0 && licensesList.length === 0 && (
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

// What a hunter can expect to find for a state, instead of raw row counts
function StateCoverageLine({ hasSeasons, hasLicenses, seasonLabel }: { hasSeasons: boolean; hasLicenses: boolean; seasonLabel: string }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs pt-2" style={{ color: `rgb(var(--color-text-tertiary))`, borderTop: `1px solid rgb(var(--color-border-primary))` }}>
      {hasSeasons ? (
        <span className="text-forest-700 dark:text-forest-400 font-medium">{seasonLabel} seasons and bag limits ✓</span>
      ) : (
        <span className="font-medium">Seasons coming soon</span>
      )}
      {hasLicenses && <span>Licenses ✓</span>}
    </div>
  )
}

export function RegulationsPage() {
  const { state } = useParams()
  // "?compare=AR,LA,MO" opens Compare with those states; changes are written back for sharing
  const [listParams, setListParams] = useSearchParams()
  const linkedCompare = listParams.get('compare')
  const [statesList, setStatesList] = useState<StateInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [regCounts, setRegCounts] = useState<StateRegCounts>({})

  const [compareMode, setCompareMode] = useState(linkedCompare !== null)
  const [compareStates, setCompareStates] = useState<Set<string>>(() =>
    new Set((linkedCompare ?? '').toUpperCase().split(',').filter(c => /^[A-Z]{2}$/.test(c)).slice(0, 4)))
  useEffect(() => {
    if (state) return
    setListParams(p => {
      const n = new URLSearchParams(p)
      if (compareMode) n.set('compare', [...compareStates].join(','))
      else n.delete('compare')
      return n
    }, { replace: true })
  }, [compareMode, compareStates, state, setListParams])

  const [mapZoom, setMapZoom] = useState(1)
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0])

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const mapColors = getMapColors(resolvedTheme)

  useEffect(() => {
    if (!state) {
      Promise.all([api.getStates(), api.getRegulationCounts(SEASON_YEAR)])
        .then(([statesData, countsData]) => {
          setStatesList(statesData.states as StateInfo[])
          setRegCounts(countsData.counts)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [state])

  // "Has data" = this season's seasons are entered. A state in the list with none (CO, MT, WY,
  // MO, IL, IA today) is shown as coming soon, after the states a hunter can use.
  const statesWithData = useMemo(
    () => new Set(statesList.filter(s => (regCounts[s.code]?.seasons ?? 0) > 0).map(s => s.code)),
    [statesList, regCounts],
  )
  const listedStates = useMemo(() => new Set(statesList.map(s => s.code)), [statesList])
  const seasonLabel = `${SEASON_YEAR}–${String(SEASON_YEAR + 1).slice(2)}`

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
    return [...list].sort((a, b) =>
      Number(statesWithData.has(b.code)) - Number(statesWithData.has(a.code)) || a.name.localeCompare(b.name))
  }, [statesList, selectedState, compareMode, search, statesWithData])

  if (state) {
    return <StateDetailView key={state.toUpperCase()} stateCode={state} />
  }

  const compareStateList = Array.from(compareStates)

  return (
    <div>
      {/* Header */}
      <div className="bg-earth-900 dark:bg-[#121416] border-b border-earth-800 dark:border-[#24272b] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Hunting Regulations by State</h1>
          </div>
          <p className="text-[#a7adb4] max-w-2xl leading-relaxed">
            Select a state to view current hunting regulations, seasons, and license requirements.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Limited data notice */}
        <DismissibleNotice id="regulations-coverage" className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md px-4 py-3 mb-6 text-sm text-yellow-800 dark:text-yellow-200">
          Regulation data is currently limited to select states. We're actively working to expand coverage across all 50 states.
        </DismissibleNotice>

        {/* Mode toggle */}
        <div className="flex gap-1.5 mb-6 w-fit">
          <button
            onClick={() => toggleCompareMode(false)}
            className={`chip px-5 min-h-10 ${!compareMode ? 'chip-on' : ''}`}
          >
            All States
          </button>
          <button
            onClick={() => toggleCompareMode(true)}
            className={`chip px-5 min-h-10 gap-2 ${compareMode ? 'chip-on' : ''}`}
          >
            Compare States
            {compareMode && compareStates.size > 0 && (
              <span className="bg-accent-500 text-white text-xs rounded-md w-5 h-5 flex items-center justify-center leading-none">
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
                <span className="w-3 h-3 rounded-sm bg-[#f4cdb1] dark:bg-[#5b3018] inline-block" /> {seasonLabel} seasons
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-accent-500 inline-block" /> {compareMode ? 'Selected' : 'Selected'}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block border" style={{ backgroundColor: `rgb(var(--color-bg-secondary))`, borderColor: `rgb(var(--color-border-primary))` }} /> No data
              </span>
            </div>
          </div>
          <p className="sm:hidden text-xs mb-2" style={{ color: `rgb(var(--color-text-tertiary))` }}>
            Map view is best on larger screens — search or tap a state card below to select one.
          </p>
          <div className="relative">
            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
              <button
                onClick={() => setMapZoom(z => Math.min(z * 1.5, 8))}
                className="w-7 h-7 rounded-md flex items-center justify-center shadow border"
                style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))`, color: `rgb(var(--color-text-secondary))` }}
                aria-label="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setMapZoom(z => Math.max(z / 1.5, 1))}
                className="w-7 h-7 rounded-md flex items-center justify-center shadow border"
                style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))`, color: `rgb(var(--color-text-secondary))` }}
                aria-label="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setMapZoom(1); setMapCenter([0, 0]) }}
                className="w-7 h-7 rounded-md flex items-center justify-center shadow border"
                style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))`, color: `rgb(var(--color-text-secondary))` }}
                aria-label="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            <ComposableMap
              projection="geoAlbersUsa"
              projectionConfig={{ scale: 1000 }}
              width={980}
              height={500}
              style={{ width: '100%', height: 'auto' }}
            >
              <ZoomableGroup zoom={mapZoom} center={mapCenter} onMoveEnd={({ zoom, coordinates }) => { setMapZoom(zoom); setMapCenter(coordinates) }}>
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map(geo => {
                      const stateName = geo.properties.name as string
                      const stateCode = STATE_NAME_TO_CODE[stateName]
                      if (!stateCode) return null
                      const hasData = statesWithData.has(stateCode)
                      const isSelected = compareMode ? compareStates.has(stateCode) : selectedState === stateCode
                      const isClickable = listedStates.has(stateCode)
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
              </ZoomableGroup>
            </ComposableMap>
          </div>
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
                      className="flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium border bg-accent-50 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-700"
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
          <label htmlFor="reg-state-search" className="sr-only">Search states</label>
          <input
            id="reg-state-search"
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
                      <StateCoverageLine hasSeasons={statesWithData.has(s.code)} hasLicenses={(regCounts[s.code]?.licenses ?? 0) > 0} seasonLabel={seasonLabel} />
                    </div>
                  )
                }

                return (
                  <Link
                    key={s.code}
                    to={`/regulations/${s.code.toLowerCase()}`}
                    className={`card p-4 hover:border-accent-400 dark:hover:border-accent-500 transition-colors ${statesWithData.has(s.code) ? '' : 'opacity-70'}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <h3 className="font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>{s.name}</h3>
                          <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>{s.agencyName || 'Wildlife Agency'}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5" style={{ color: `rgb(var(--color-text-tertiary))` }} />
                    </div>
                    <StateCoverageLine hasSeasons={statesWithData.has(s.code)} hasLicenses={(regCounts[s.code]?.licenses ?? 0) > 0} seasonLabel={seasonLabel} />
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
