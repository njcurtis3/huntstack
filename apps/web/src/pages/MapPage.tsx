import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import maplibregl from 'maplibre-gl'
import { ChevronLeft, ChevronRight, Layers, Lock, X, ExternalLink } from 'lucide-react'
import { api, safeHttpUrl } from '../lib/api'
import { getAccount, startCheckout } from '../lib/account'
import { MAP_FREE_TAPS, mapTapsUsed, spendMapTap } from '../lib/mapAllowance'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { oldSurveyLabel, parseCalendarDate } from '../lib/dates'
import { computeMigrationIndex, formatChange, getAnomaly, headlineStats, staleThresholdFor } from '../lib/migrationStats'
import type { AnomalyType, MigrationIndexResult } from '../lib/migrationStats'
import {
  PUSH_SCORE_LABELS, STATE_CENTROIDS, STATUS_HEX, STATUS_LABELS, enrichCounts, flowLegs, groupRefuges, groupStates,
  overallPushScoreOf, sortCounts,
} from '../lib/migrationGroups'
import type { FlowLeg, StateGroup } from '../lib/migrationGroups'
import type { FieldReportPublic } from '../lib/fieldReports'
import { ACTIVITIES, COUNT_BUCKETS } from '../lib/fieldReports'
import {
  addDays, dedupeSeasons, groupForSpecies, isOpenOn, isSpecialSeason, isoDay, nextChange,
  seasonYearOf, seasonsForZone, zoneStatus,
} from '../lib/zoneSeasons'
import type { BirdGroup, MapSeason, ZoneProperties, ZoneStatus } from '../lib/zoneSeasons'

// The planning map: season zones shaded open or closed for a chosen day, with the Migration
// page's picture (each state's status, flyway flow arrows, weather-push badges, count spikes and
// drops, the Migration Index), survey sites, eBird (every hotspot with a duck or goose report in
// 14 days, the areas HuntStack watches, and statewide activity in a zone's details) and hunter
// reports on top. Pre-hunt only: no GPS tracks, saved spots or offline.

const ZONE_URL = '/data/waterfowl-zones-2026.json'
const ZONE_STATES = ['TX', 'KS', 'OK', 'NM', 'LA', 'AR', 'MO', 'IL', 'IA']
// The agency's waterfowl page, linked when a zone has no season rows of its own to cite.
const AGENCY_PAGES: Record<string, string> = {
  MO: 'https://mdc.mo.gov/hunting-trapping/species/waterfowl',
  IL: 'https://dnr.illinois.gov/hunting/waterfowl.html',
  IA: 'https://www.iowadnr.gov/things-do/hunting-trapping/types-hunting-trapping/migratory-game-bird-hunting',
}
const STATE_NAMES: Record<string, string> = {
  TX: 'Texas', KS: 'Kansas', OK: 'Oklahoma', NM: 'New Mexico', LA: 'Louisiana', AR: 'Arkansas',
  MO: 'Missouri', IL: 'Illinois', IA: 'Iowa',
}
const KEY = import.meta.env.VITE_MAPTILER_KEY ?? ''
const styleUrl = (base: 'map' | 'satellite', theme: 'light' | 'dark') =>
  `https://api.maptiler.com/maps/${base === 'satellite' ? 'hybrid' : theme === 'dark' ? 'outdoor-v2-dark' : 'outdoor-v2'}/style.json?key=${KEY}`

const ZONE_BOUNDS: [number, number, number, number] = [-109.1, 25.8, -87.5, 43.5]

// Zone fills: field green for open, ochre for special days only, graphite for closed.
const FILL = {
  light: { open: '#2f8f55', special: '#c99a2e', closed: '#8a9098' },
  dark: { open: '#5acb86', special: '#e0b84a', closed: '#6b7178' },
}
const EBIRD_COLOR = '#8250df'
const REPORT_COLOR = '#d97706'
// Flyway flow arrows (the Migration page's colors)
const FLOW_COLOR = { south: '#1f883d', north: '#0969da', both: '#bf8700' } as const
// Migration pressure 0–3: calm, moderate, high, extreme
const PUSH_COLOR = ['#8c959f', '#d4a72c', '#f97316', '#ef4444']
const SPIKE_COLOR = '#cf222e'
const DROP_COLOR = '#0969da'
// The Texas High Plains duck zone is scored on its own weather; its badge sits near Amarillo
const REGION_POINTS: Record<string, [number, number]> = { 'TX-HP': [-101.8, 34.9] }

type Point = { type: 'Point'; coordinates: [number, number] }
type Line = { type: 'LineString'; coordinates: [number, number][] }
type Area = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] }
type FeatureCollection<G, P = Record<string, unknown>> = {
  type: 'FeatureCollection'
  features: Array<{ type: 'Feature'; properties: P; geometry: G }>
}

type Base = 'map' | 'satellite'
type LayerKey = 'zones' | 'flow' | 'pressure' | 'spikes' | 'sites' | 'hotspots' | 'ebird' | 'reports'
type Selection =
  | { kind: 'zone'; id: string }
  | { kind: 'state'; id: string }
  | { kind: 'site'; id: string }
  | { kind: 'hotspot'; id: string }
  | { kind: 'ebird'; id: string }
  | { kind: 'report'; id: string }

type EbirdMap = Awaited<ReturnType<typeof api.getEbirdMap>>
type StateSpecies = EbirdMap['stateSpecies'][number]
type PushFactor = Awaited<ReturnType<typeof api.getMigrationPushFactors>>['pushFactors'][number]
type DashCount = Awaited<ReturnType<typeof api.getMigrationDashboard>>['currentCounts'][number]
type MigrationCount = ReturnType<typeof enrichCounts<DashCount & { source?: string }>>[number]

/** What the Migration page says about one state, for its marker and a zone's details. */
type StateMigrationInfo = {
  state: string
  group: StateGroup<MigrationCount> | null
  index: MigrationIndexResult | null
  push: PushFactor | null
  regions: PushFactor[]
  legs: FlowLeg[]
}

/** A public eBird hotspot: the latest report of each species there in the last 14 days. */
type Hotspot = {
  id: string
  name: string
  state: string
  lat: number
  lng: number
  reports: Array<{ slug: string; name: string; count: number | null; date: string; group: BirdGroup }>
}

/** An area HuntStack watches on eBird (a circle around a refuge or town). quiet = checked, nothing reported. */
type EbirdArea = { id: string; name: string; state: string; lat: number; lng: number; rows: CountRow[]; quiet: boolean }

type CountRow = {
  refugeId: string
  refugeName: string
  state: string
  species: string
  speciesName: string
  count: number
  surveyDate: string
  centerPoint: { lat: number; lng: number } | null
  previousCount: number | null
  deltaPercent: number | null
}

type Site = {
  /** A count spike (or, failing that, a drop) at this site's current survey */
  anomaly: AnomalyType
  id: string
  name: string
  state: string
  lat: number
  lng: number
  total: number
  latestDate: string
  isStale: boolean
  changePercent: number | null
  species: CountRow[]
}

const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  parseCalendarDate(day).toLocaleDateString('en-US', opts)
const fmtRange = (s: MapSeason) =>
  s.start === s.end ? fmtDay(s.start, { month: 'short', day: 'numeric' })
    : `${fmtDay(s.start, { month: 'short', day: 'numeric' })} – ${fmtDay(s.end, { month: 'short', day: 'numeric' })}`
const fmtNum = (n: number) => n.toLocaleString('en-US')

const STATUS_TEXT: Record<ZoneStatus, string> = {
  open: 'Open',
  special: 'Special season only',
  closed: 'Closed',
  none: 'No season dates in HuntStack yet',
}

// ---------- data ----------

function useZones() {
  return useQuery({
    queryKey: ['map-zones'],
    queryFn: async () => {
      const res = await fetch(ZONE_URL)
      if (!res.ok) throw new Error('Could not load zone shapes')
      return (await res.json()) as FeatureCollection<Area, ZoneProperties>
    },
    staleTime: Infinity,
  })
}

function useSeasons(year: number) {
  return useQuery({
    queryKey: ['map-seasons', year],
    queryFn: async (): Promise<MapSeason[]> => {
      const [speciesData, ...perState] = await Promise.all([
        api.getSpecies({ category: 'waterfowl' }),
        ...ZONE_STATES.map(st => api.getStateSeasons(st, { year })),
      ])
      const slugById = new Map(speciesData.species.map(s => [s.id, s.slug]))
      return perState.flatMap(r => r.seasons.map(s => {
        const bag = (s.bagLimit && typeof s.bagLimit === 'object') ? s.bagLimit as { daily?: unknown } : null
        return {
          state: r.state,
          name: s.name,
          seasonType: s.seasonType,
          start: s.startDate.slice(0, 10),
          end: s.endDate.slice(0, 10),
          units: Array.isArray(s.units) ? s.units.filter((u): u is string => typeof u === 'string') : [],
          group: groupForSpecies(slugById.get(s.speciesId) ?? ''),
          bagDaily: typeof bag?.daily === 'number' ? bag.daily : null,
          sourceUrl: s.sourceUrl,
          restrictions: s.restrictions,
        }
      }))
    },
    staleTime: 10 * 60_000,
  })
}

/** Survey sites: each site's species counts, latest survey first; old surveys kept but marked. */
function buildSites(counts: CountRow[]): Site[] {
  const threshold = staleThresholdFor(new Date()).getTime()
  const byId = new Map<string, CountRow[]>()
  for (const c of counts) {
    if (!c.centerPoint) continue
    const arr = byId.get(c.refugeId) ?? []
    arr.push(c)
    byId.set(c.refugeId, arr)
  }
  return [...byId.entries()].map(([id, all]) => {
    const fresh = all.filter(c => parseCalendarDate(c.surveyDate).getTime() >= threshold)
    const isStale = fresh.length === 0
    const rows = (isStale ? all : fresh).slice().sort((a, b) => b.count - a.count)
    const total = rows.reduce((s, c) => s + (c.count || 0), 0)
    const withPrev = rows.filter(c => c.previousCount != null)
    const prevTotal = withPrev.reduce((s, c) => s + (c.previousCount ?? 0), 0)
    const nowTotal = withPrev.reduce((s, c) => s + c.count, 0)
    // Same rule as the Migration page: only a current survey can spike or drop
    const kinds = isStale ? [] : rows.map(c => getAnomaly(c.count, c.deltaPercent, c.previousCount))
    return {
      anomaly: kinds.includes('spike') ? 'spike' as const : kinds.includes('drop') ? 'drop' as const : null,
      id,
      name: rows[0].refugeName,
      state: rows[0].state,
      lat: rows[0].centerPoint!.lat,
      lng: rows[0].centerPoint!.lng,
      total,
      latestDate: rows.reduce((d, c) => (c.surveyDate > d ? c.surveyDate : d), rows[0].surveyDate),
      isStale,
      changePercent: prevTotal > 0 ? Math.round(((nowTotal - prevTotal) / prevTotal) * 100) : null,
      species: rows,
    }
  })
}

/** Unpack the API's compact hotspot list (species as indexes, dates as days after firstDay). */
function decodeHotspots(h: EbirdMap['hotspots'] | undefined): Hotspot[] {
  if (!h) return []
  return h.places.map(p => ({
    id: p.id,
    name: p.n,
    state: p.st,
    lng: p.c[0],
    lat: p.c[1],
    reports: p.r.map(([i, count, d]) => ({
      slug: h.species[i],
      name: h.speciesNames[i],
      count,
      date: addDays(h.firstDay, d),
      group: groupForSpecies(h.species[i]),
    })),
  }))
}

/** Birds reported at a hotspot for one group, and whether any were seen (uncounted reports add 0). */
function hotspotBirds(h: Hotspot, group: BirdGroup) {
  const mine = h.reports.filter(r => r.group === group)
  return { birds: mine.reduce((n, r) => n + (r.count ?? 0), 0), seen: mine.length > 0 }
}

// ---------- page ----------

export default function MapPage() {
  const [params, setParams] = useSearchParams()
  const today = isoDay(new Date())
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today
  const group: BirdGroup = params.get('birds') === 'goose' ? 'goose' : 'duck'
  const setDay = (d: string) => setParams(p => { const n = new URLSearchParams(p); if (d === today) n.delete('date'); else n.set('date', d); return n }, { replace: true })
  const setGroup = (g: BirdGroup) => setParams(p => { const n = new URLSearchParams(p); if (g === 'duck') n.delete('birds'); else n.set('birds', g); return n }, { replace: true })

  const { resolvedTheme } = useThemeStore()
  const [base, setBase] = useState<Base>('map')
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    zones: true, flow: true, pressure: true, spikes: true, sites: true, hotspots: true, ebird: true, reports: true,
  })
  const [selection, setSelection] = useState<Selection | null>(null)
  const [panelOpen, setPanelOpen] = useState(false) // phone: layers and legend

  // Paywall: Pro (and admin) see everything; everyone else gets MAP_FREE_TAPS details a day,
  // then the map blurs behind the Subscribe card. A signed-in user's plan is unknown until their
  // account loads, and until then taps are let through uncounted rather than walling a subscriber.
  const authLoading = useAuthStore(s => s.isLoading)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const userId = useAuthStore(s => s.user?.id ?? null)
  const accountQ = useQuery({
    queryKey: ['account', userId],
    queryFn: getAccount,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const account = accountQ.data
  const unlimited = !!account && (account.usage.plan === 'pro' || account.usage.plan === 'admin' || !!account.subscription?.active)
  const planKnown = !authLoading && (!isAuthenticated || accountQ.isSuccess || accountQ.isError)
  const metered = planKnown && !unlimited
  const [tapsUsed, setTapsUsed] = useState(mapTapsUsed)
  const [wallHit, setWallHit] = useState(() => mapTapsUsed() >= MAP_FREE_TAPS)
  const walled = metered && wallHit
  const gateRef = useRef({ metered, walled, selectionId: '' })
  gateRef.current = { metered, walled, selectionId: selection ? `${selection.kind}:${selection.id}` : '' }
  useEffect(() => { if (walled) { setSelection(null); setPanelOpen(false) } }, [walled])
  const pageRef = useRef<HTMLDivElement>(null)
  // Nothing behind the wall can be reached by keyboard or a screen reader either
  useEffect(() => { pageRef.current?.toggleAttribute('inert', walled) }, [walled])

  const zonesQ = useZones()
  const year = seasonYearOf(day)
  const seasonsQ = useSeasons(year)
  const dashQ = useQuery({
    queryKey: ['map-dashboard'],
    queryFn: () => api.getMigrationDashboard(),
    staleTime: 5 * 60_000,
  })
  const reportsQ = useQuery({
    queryKey: ['field-reports', 7],
    queryFn: () => api.getFieldReports(7),
    staleTime: 60_000,
    retry: false,
  })

  const ebirdQ = useQuery({
    queryKey: ['map-ebird'],
    queryFn: () => api.getEbirdMap(),
    staleTime: 10 * 60_000,
    retry: false,
  })

  // Migration pressure for the states with survey counts, asked the same way the Migration page asks
  const pushStates = useMemo(() => {
    const s = [...new Set((dashQ.data?.currentCounts ?? []).map(c => c.state))].sort()
    return s.length > 0 ? s.join(',') : 'TX,NM,AR,LA,KS,OK,MO'
  }, [dashQ.data])
  const pushQ = useQuery({
    queryKey: ['map-push', pushStates],
    queryFn: () => api.getMigrationPushFactors(pushStates),
    enabled: dashQ.isSuccess,
    staleTime: 10 * 60_000,
    retry: false,
  })
  // Statewide eBird activity levels, one part of the Migration Index
  const activityQ = useQuery({
    queryKey: ['map-regional-activity'],
    queryFn: () => api.getMigrationRegionalActivity(),
    staleTime: 10 * 60_000,
    retry: false,
  })

  const zones = zonesQ.data
  const seasons = useMemo(() => seasonsQ.data ?? [], [seasonsQ.data])
  const sites = useMemo(() => buildSites((dashQ.data?.currentCounts ?? []) as CountRow[]), [dashQ.data])
  // eBird rows of every watched area, by area id; an area at a survey site is shown in that
  // site's details instead of as its own marker
  const ebirdById = useMemo(() => {
    const byId = new Map<string, CountRow[]>()
    for (const r of (dashQ.data?.ebirdCounts ?? []) as CountRow[]) byId.set(r.refugeId, [...(byId.get(r.refugeId) ?? []), r])
    for (const rs of byId.values()) rs.sort((a, b) => b.count - a.count)
    return byId
  }, [dashQ.data])
  const ebirdAreas = useMemo((): EbirdArea[] => {
    const siteIds = new Set(sites.map(s => s.id))
    const withBirds = [...ebirdById.entries()].filter(([, rs]) => rs[0].centerPoint).map(([id, rs]) => ({
      id, name: rs[0].refugeName, state: rs[0].state, lat: rs[0].centerPoint!.lat, lng: rs[0].centerPoint!.lng, rows: rs, quiet: false,
    }))
    const quiet = (dashQ.data?.quietEbirdPlaces ?? []).map(q => ({
      id: q.refugeId, name: q.refugeName, state: q.state, lat: q.centerPoint.lat, lng: q.centerPoint.lng, rows: [], quiet: true,
    }))
    return [...withBirds, ...quiet].filter(a => !siteIds.has(a.id))
  }, [ebirdById, dashQ.data, sites])
  const hotspots = useMemo(() => decodeHotspots(ebirdQ.data?.hotspots), [ebirdQ.data])
  const stateSpecies = useMemo(() => ebirdQ.data?.stateSpecies ?? [], [ebirdQ.data])
  const ebirdStates = useMemo(() => ebirdQ.data?.states ?? [], [ebirdQ.data])
  const reports = useMemo(() => reportsQ.data?.reports ?? [], [reportsQ.data])

  // ---------- migration: the Migration page's numbers, all flyways and species ----------

  // Agency surveys and eBird rows together, as the Migration page groups them
  const migrationCounts = useMemo((): MigrationCount[] => enrichCounts([
    ...(dashQ.data?.currentCounts ?? []).map(c => ({ ...c, source: 'official' })),
    ...(dashQ.data?.ebirdCounts ?? []),
  ]), [dashQ.data])
  const stateGroups = useMemo(
    () => groupStates(groupRefuges(sortCounts(migrationCounts)), code => STATE_NAMES[code] ?? code),
    [migrationCounts],
  )
  const legs = useMemo(() => flowLegs(stateGroups), [stateGroups])
  const pushFactors = useMemo(() => pushQ.data?.pushFactors ?? [], [pushQ.data])
  const regionalPush = useMemo(() => pushQ.data?.regionalPushFactors ?? [], [pushQ.data])
  const overallPush = useMemo(() => overallPushScoreOf([...pushFactors, ...regionalPush]), [pushFactors, regionalPush])
  const stateActivity = activityQ.data?.stateActivity
  const migrationReady = dashQ.isSuccess && !pushQ.isLoading && !activityQ.isLoading
  const migrationIndex = useMemo(
    () => computeMigrationIndex(headlineStats(migrationCounts).fresh, overallPush, stateActivity),
    [migrationCounts, overallPush, stateActivity],
  )
  /** One state's migration, the way the Migration page shows it with that state picked. */
  const stateMigration = (state: string): StateMigrationInfo => {
    const group = stateGroups.find(g => g.state === state) ?? null
    const mine = migrationCounts.filter(c => c.state === state)
    return {
      state,
      group,
      index: mine.length > 0 ? computeMigrationIndex(headlineStats(mine).fresh, overallPush, stateActivity) : null,
      push: pushFactors.find(p => p.stateCode === state) ?? null,
      regions: regionalPush.filter(p => p.stateCode === state),
      legs: legs.filter(l => l.from === state || l.to === state),
    }
  }

  const statusById = useMemo(() => {
    const m = new Map<string, ZoneStatus>()
    for (const f of zones?.features ?? []) {
      m.set(f.properties.id, zoneStatus(seasonsForZone(seasons, f.properties, group), day))
    }
    return m
  }, [zones, seasons, group, day])

  const noSeasonData = seasonsQ.isSuccess && seasons.length === 0 // the whole season year is missing
  // States with zone lines but no season rows: drawn dashed, with no fill. Until the season
  // query answers, none are (a slow load shouldn't flash every state dashed).
  const noDateStates = useMemo(
    () => (seasonsQ.isSuccess ? ZONE_STATES.filter(st => !seasons.some(s => s.state === st)) : []),
    [seasonsQ.isSuccess, seasons],
  )
  const noDatesRef = useRef(noDateStates)
  noDatesRef.current = noDateStates

  // ---------- map ----------

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [styleReady, setStyleReady] = useState(0) // bumps each time a style finishes loading
  const [installed, setInstalled] = useState(0) // bumps each time our layers are added to a style
  // Read by the layer setup, which runs on style.load rather than when these change
  const themeRef = useRef(resolvedTheme)
  themeRef.current = resolvedTheme
  const baseRef = useRef(base)
  baseRef.current = base
  const groupRef = useRef(group)
  groupRef.current = group

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl('map', themeRef.current),
      bounds: ZONE_BOUNDS,
      // Room for the phone's floating control bar
      fitBoundsOptions: { padding: window.innerWidth < 768 ? { top: 72, bottom: 16, left: 12, right: 12 } : 24 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Zones: TPWD, KDWP, MDC, USFWS, US Census · Sightings: eBird (Cornell Lab of Ornithology)',
    }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false } }), 'top-right')
    map.on('style.load', () => setStyleReady(n => n + 1))
    // Compact credits open themselves on load; start them closed so they don't cover the map
    map.once('load', () => {
      containerRef.current?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show')
    })
    mapRef.current = map
    appliedStyle.current = styleUrl('map', themeRef.current)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Basemap and theme: swapping the style drops our layers; style.load puts them back.
  const appliedStyle = useRef('')
  useEffect(() => {
    const url = styleUrl(base, resolvedTheme)
    if (!mapRef.current || url === appliedStyle.current) return
    appliedStyle.current = url
    mapRef.current.setStyle(url, { diff: false })
  }, [base, resolvedTheme])

  // Add our sources and layers after every style load.
  useEffect(() => {
    const map = mapRef.current
    if (!map || styleReady === 0 || !zones) return
    if (map.getSource('zones')) return
    const theme = themeRef.current
    const base = baseRef.current
    const t = theme === 'dark' ? FILL.dark : FILL.light
    const ink = theme === 'dark' && base === 'map' ? '#ecedee' : '#111315'
    const paper = theme === 'dark' && base === 'map' ? '#111315' : '#ffffff'
    const fillOpacity = base === 'satellite' ? 0.5 : 0.36

    map.addSource('zones', { type: 'geojson', data: zones, promoteId: 'id' })
    map.addLayer({
      id: 'zones-fill', type: 'fill', source: 'zones',
      paint: {
        'fill-color': ['match', ['feature-state', 'status'], 'open', t.open, 'special', t.special, 'closed', t.closed, 'rgba(0,0,0,0)'],
        'fill-opacity': ['case', ['==', ['feature-state', 'status'], 'closed'], fillOpacity * 0.55, fillOpacity],
      },
    })
    const noDates = noDatesFilter(noDatesRef.current)
    map.addLayer({
      id: 'zones-line', type: 'line', source: 'zones',
      filter: ['!', noDates],
      paint: { 'line-color': base === 'satellite' ? '#ffffff' : ink, 'line-width': 1, 'line-opacity': 0.55 },
    })
    // States with zone lines but no season dates: dashed outlines, no fill
    map.addLayer({
      id: 'zones-line-nodates', type: 'line', source: 'zones',
      filter: noDates,
      paint: { 'line-color': base === 'satellite' ? '#ffffff' : ink, 'line-width': 1.2, 'line-opacity': 0.6, 'line-dasharray': [3, 2] },
    })
    map.addLayer({
      id: 'zones-selected', type: 'line', source: 'zones',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#e2561b', 'line-width': 3 },
    })

    // eBird hotspots: every public place with a report of the chosen birds, sized by birds reported
    map.addSource('hotspots', { type: 'geojson', data: emptyFc() })
    map.addLayer({
      id: 'hotspots', type: 'circle', source: 'hotspots',
      filter: hotspotFilter(groupRef.current),
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', groupRef.current]], 0, 2.5, 10, 4, 40, 7, 100, 11],
        'circle-color': EBIRD_COLOR,
        'circle-opacity': 0.7,
        'circle-stroke-color': paper,
        'circle-stroke-width': 0.75,
      },
    })
    map.addLayer({
      id: 'hotspots-selected', type: 'circle', source: 'hotspots',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#e2561b', 'circle-stroke-width': 3 },
    })
    // eBird areas HuntStack watches: rings; faint when nothing was reported
    map.addSource('ebird', { type: 'geojson', data: emptyFc() })
    map.addLayer({
      id: 'ebird', type: 'circle', source: 'ebird',
      paint: {
        'circle-radius': 9,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': EBIRD_COLOR,
        'circle-stroke-width': ['case', ['get', 'quiet'], 1.5, 2.5],
        'circle-stroke-opacity': ['case', ['get', 'quiet'], 0.45, 1],
      },
    })
    map.addLayer({
      id: 'ebird-selected', type: 'circle', source: 'ebird',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#e2561b', 'circle-stroke-width': 3 },
    })

    // Migration: arrows between states down each flyway, a marker per state colored by its
    // migration status, and a weather-push badge beside it
    addMigrationImages(map, paper)
    map.addSource('flow', { type: 'geojson', data: emptyFc() })
    map.addLayer({
      id: 'flow-line', type: 'line', source: 'flow',
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': ['match', ['get', 'flow'], 'south', FLOW_COLOR.south, 'north', FLOW_COLOR.north, FLOW_COLOR.both],
        'line-width': 3.5,
        'line-opacity': 0.85,
      },
    })
    map.addLayer({
      id: 'flow-arrow', type: 'symbol', source: 'flow',
      layout: {
        'symbol-placement': 'line-center',
        'icon-image': ['concat', 'hs-flow-', ['get', 'flow']],
        'icon-size': 1.25,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
    map.addSource('states', { type: 'geojson', data: emptyFc() })
    map.addLayer({
      id: 'states', type: 'circle', source: 'states',
      paint: {
        'circle-radius': 8,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': paper,
        'circle-stroke-width': 2.5,
      },
    })
    map.addLayer({
      id: 'states-selected', type: 'circle', source: 'states',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#e2561b', 'circle-stroke-width': 3 },
    })
    map.addSource('pressure', { type: 'geojson', data: emptyFc() })
    map.addLayer({
      id: 'pressure', type: 'symbol', source: 'pressure',
      layout: {
        'icon-image': ['concat', 'hs-push-', ['to-string', ['get', 'level']]],
        // Beside the state marker, up and to the right
        'icon-offset': ['case', ['get', 'region'], ['literal', [0, 0]], ['literal', [17, -15]]],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })

    map.addSource('sites', { type: 'geojson', data: emptyFc() })
    map.addLayer({
      id: 'sites', type: 'circle', source: 'sites',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'total']], 0, 4, 100, 9, 400, 18, 800, 26],
        'circle-color': ['case', ['get', 'stale'], 'rgba(0,0,0,0)', ink],
        'circle-opacity': ['case', ['get', 'stale'], 1, 0.82],
        'circle-stroke-color': ['case', ['get', 'stale'], ink, paper],
        'circle-stroke-width': ['case', ['get', 'stale'], 1.5, 1.5],
        'circle-stroke-opacity': ['case', ['get', 'stale'], 0.6, 1],
      },
    })
    // Count spikes and drops: a small badge on the upper right of the site's dot
    map.addSource('spikes', { type: 'geojson', data: emptyFc() })
    map.addLayer({
      id: 'spikes', type: 'symbol', source: 'spikes',
      layout: {
        'icon-image': ['concat', 'hs-anom-', ['get', 'kind']],
        'icon-offset': ['step', ['get', 'r'],
          ['literal', [5, -5]], 7, ['literal', [7, -7]], 11, ['literal', [10, -10]], 15, ['literal', [13, -13]], 19, ['literal', [16, -16]], 23, ['literal', [19, -19]]],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
    map.addSource('reports', { type: 'geojson', data: emptyFc() })
    map.addLayer({
      id: 'reports', type: 'circle', source: 'reports',
      paint: { 'circle-radius': 6, 'circle-color': REPORT_COLOR, 'circle-stroke-color': paper, 'circle-stroke-width': 2 },
    })
    map.addLayer({
      id: 'points-selected', type: 'circle', source: 'sites',
      filter: ['==', ['get', 'id'], ''],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'total']], 0, 7, 100, 12, 400, 21, 800, 29],
        'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#e2561b', 'circle-stroke-width': 3,
      },
    })
    setInstalled(n => n + 1) // re-run the data effects below against the new layers
  }, [styleReady, zones])

  // Zone shading for the chosen day and birds.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('zones') || !zones) return
    for (const f of zones.features) {
      map.setFeatureState({ source: 'zones', id: f.properties.id }, { status: statusById.get(f.properties.id) ?? 'none' })
    }
  }, [statusById, zones, installed])

  // Dashed outlines follow which states have season rows.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('zones-line-nodates')) return
    const f = noDatesFilter(noDateStates)
    map.setFilter('zones-line', ['!', f])
    map.setFilter('zones-line-nodates', f)
  }, [noDateStates, installed])

  // Point layers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('sites')) return
    ;(map.getSource('sites') as maplibregl.GeoJSONSource).setData(pointFc(sites.map(s => ({
      lng: s.lng, lat: s.lat, props: { id: s.id, total: s.total, stale: s.isStale },
    }))))
    ;(map.getSource('ebird') as maplibregl.GeoJSONSource).setData(pointFc(ebirdAreas.map(p => ({
      lng: p.lng, lat: p.lat, props: { id: p.id, quiet: p.quiet },
    }))))
    ;(map.getSource('hotspots') as maplibregl.GeoJSONSource).setData(pointFc(hotspots.map(h => {
      const duck = hotspotBirds(h, 'duck')
      const goose = hotspotBirds(h, 'goose')
      return { lng: h.lng, lat: h.lat, props: { id: h.id, duck: duck.birds, goose: goose.birds, duckSeen: duck.seen, gooseSeen: goose.seen } }
    })))
    ;(map.getSource('reports') as maplibregl.GeoJSONSource).setData(pointFc(reportCells(reports).map(c => ({
      lng: c.lng, lat: c.lat, props: { id: c.id },
    }))))
    ;(map.getSource('spikes') as maplibregl.GeoJSONSource).setData(pointFc(sites.filter(s => s.anomaly).map(s => ({
      lng: s.lng, lat: s.lat, props: { id: s.id, kind: s.anomaly, r: siteRadius(s.total) },
    }))))
  }, [sites, ebirdAreas, hotspots, reports, installed])

  // Migration layers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('flow')) return
    ;(map.getSource('flow') as maplibregl.GeoJSONSource).setData(flowLines(legs))
    ;(map.getSource('states') as maplibregl.GeoJSONSource).setData(pointFc(stateGroups.flatMap(g => {
      const at = STATE_CENTROIDS[g.state]
      return at ? [{ lng: at[0], lat: at[1], props: { id: g.state, color: STATUS_HEX[g.dominantStatus ?? 'none'] } }] : []
    })))
    ;(map.getSource('pressure') as maplibregl.GeoJSONSource).setData(pointFc([...pushFactors, ...regionalPush].flatMap(f => {
      const at = f.regionId ? REGION_POINTS[f.regionId] : STATE_CENTROIDS[f.stateCode]
      return at ? [{ lng: at[0], lat: at[1], props: { id: f.stateCode, level: pushLevel(f.pushScore), region: !!f.regionId } }] : []
    })))
  }, [legs, stateGroups, pushFactors, regionalPush, installed])

  // Hotspots show the chosen birds: only places that reported them, sized by how many.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('hotspots')) return
    map.setFilter('hotspots', hotspotFilter(group))
    map.setPaintProperty('hotspots', 'circle-radius', ['interpolate', ['linear'], ['sqrt', ['get', group]], 0, 2.5, 10, 4, 40, 7, 100, 11])
  }, [group, installed])

  // Layer visibility.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('zones-fill')) return
    const vis = (on: boolean) => (on ? 'visible' : 'none')
    for (const id of ['zones-fill', 'zones-line', 'zones-line-nodates', 'zones-selected']) map.setLayoutProperty(id, 'visibility', vis(layers.zones))
    map.setLayoutProperty('sites', 'visibility', vis(layers.sites))
    map.setLayoutProperty('points-selected', 'visibility', vis(layers.sites))
    map.setLayoutProperty('ebird', 'visibility', vis(layers.ebird))
    map.setLayoutProperty('ebird-selected', 'visibility', vis(layers.ebird))
    map.setLayoutProperty('hotspots', 'visibility', vis(layers.hotspots))
    map.setLayoutProperty('hotspots-selected', 'visibility', vis(layers.hotspots))
    map.setLayoutProperty('reports', 'visibility', vis(layers.reports))
    for (const id of ['flow-line', 'flow-arrow', 'states', 'states-selected']) map.setLayoutProperty(id, 'visibility', vis(layers.flow))
    map.setLayoutProperty('pressure', 'visibility', vis(layers.pressure))
    // A spike badge belongs to its site's dot
    map.setLayoutProperty('spikes', 'visibility', vis(layers.spikes && layers.sites))
  }, [layers, installed])

  // Selection outline.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('zones-selected')) return
    const sel = (kind: Selection['kind']) => ['==', ['get', 'id'], selection?.kind === kind ? selection.id : ''] as maplibregl.FilterSpecification
    map.setFilter('zones-selected', sel('zone'))
    map.setFilter('points-selected', sel('site'))
    map.setFilter('ebird-selected', sel('ebird'))
    map.setFilter('hotspots-selected', sel('hotspot'))
    map.setFilter('states-selected', sel('state'))
  }, [selection, installed])

  // Taps: the topmost thing under the finger wins: a report, a site (or its spike badge), a
  // state's pressure badge or marker, an eBird area, an eBird hotspot, then a zone (the order
  // they're drawn in, top first).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const order: Array<[string, Selection['kind']]> = [
      ['reports', 'report'], ['spikes', 'site'], ['sites', 'site'], ['pressure', 'state'], ['states', 'state'],
      ['ebird', 'ebird'], ['hotspots', 'hotspot'], ['zones-fill', 'zone'],
    ]
    const onClick = (e: maplibregl.MapMouseEvent) => {
      // Hotspot dots are small and close together, so they get only a little slack: with the
      // full 6px, a tap on a zone almost always landed on some dot instead
      const box = (pad: number): [maplibregl.PointLike, maplibregl.PointLike] => [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]]
      for (const [layer, kind] of order) {
        if (!map.getLayer(layer) || map.getLayoutProperty(layer, 'visibility') === 'none') continue
        const hit = map.queryRenderedFeatures(kind === 'zone' ? e.point : box(kind === 'hotspot' ? 2 : 6), { layers: [layer] })[0]
        if (hit) {
          const id = String(hit.properties?.id)
          const gate = gateRef.current
          if (gate.walled) return
          // Tapping the thing already open is not a new tap
          if (gate.metered && gate.selectionId !== `${kind}:${id}`) {
            const spent = spendMapTap()
            setTapsUsed(spent.used)
            if (!spent.allowed) {
              setWallHit(true)
              return
            }
          }
          setSelection({ kind, id } as Selection)
          setPanelOpen(false)
          return
        }
      }
      setSelection(null)
    }
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const layersHere = ['reports', 'spikes', 'sites', 'pressure', 'states', 'ebird', 'hotspots', 'zones-fill'].filter(l => map.getLayer(l))
      const hit = layersHere.length > 0 && map.queryRenderedFeatures(e.point, { layers: layersHere }).length > 0
      map.getCanvas().style.cursor = hit ? 'pointer' : ''
    }
    map.on('click', onClick)
    map.on('mousemove', onMove)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
    }
  }, [])

  // Keyboard: Escape closes the details.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelection(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- details ----------

  const details = (() => {
    if (!selection) return null
    if (selection.kind === 'zone') {
      const f = zones?.features.find(z => z.properties.id === selection.id)
      if (!f) return null
      return (
        <ZoneDetails zone={f.properties} seasons={seasons} group={group} day={day}>
          {migrationReady && <StateMigration info={stateMigration(f.properties.state)} compact />}
          <StateEbird state={f.properties.state} group={group} rows={stateSpecies} covered={ebirdStates.includes(f.properties.state)} loaded={ebirdQ.isSuccess} />
        </ZoneDetails>
      )
    }
    if (selection.kind === 'state') return <StateMigration info={stateMigration(selection.id)} />

    if (selection.kind === 'site') {
      const s = sites.find(x => x.id === selection.id)
      return s ? <SiteDetails site={s} day={day} ebird={ebirdById.get(s.id) ?? []} /> : null
    }
    if (selection.kind === 'ebird') {
      const p = ebirdAreas.find(x => x.id === selection.id)
      return p ? <EbirdDetails place={p} /> : null
    }
    if (selection.kind === 'hotspot') {
      const h = hotspots.find(x => x.id === selection.id)
      return h ? <HotspotDetails spot={h} group={group} /> : null
    }
    const cell = reportCells(reports).find(c => c.id === selection.id)
    return cell ? <ReportDetails reports={cell.reports} /> : null
  })()

  const loadError = zonesQ.isError || seasonsQ.isError

  const summaryProps = {
    ready: migrationReady,
    index: migrationIndex,
    pushLevel: overallPush,
    pushKnown: pushQ.isSuccess,
    legs,
    spikes: stateGroups.flatMap(g => g.refuges).filter(r => r.topAnomaly === 'spike').length,
    drops: stateGroups.flatMap(g => g.refuges).filter(r => r.topAnomaly === 'drop').length,
  }

  const tapsLeft = metered ? <TapsLeft used={tapsUsed} signedIn={isAuthenticated} /> : null

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
    <div
      ref={pageRef}
      className={`flex-1 min-h-0 flex flex-col md:flex-row ${walled ? 'pointer-events-none select-none' : ''}`}
      style={walled ? { filter: 'blur(6px)' } : undefined}
      aria-hidden={walled || undefined}
    >
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex md:w-80 lg:w-[22rem] shrink-0 flex-col border-r overflow-y-auto"
        style={{ backgroundColor: 'rgb(var(--color-bg-primary))', borderColor: 'rgb(var(--color-border-primary))' }}
      >
        <div className="p-5 border-b" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
          <p className="eyebrow mb-1.5">Season map</p>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'rgb(var(--color-text-primary))' }}>Map</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
            Which zones are open on a given day, with migration, survey counts, eBird sightings and hunter reports on top.
          </p>
        </div>
        <div className="p-5 space-y-6 border-b" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
          <GroupChips group={group} onChange={setGroup} />
          <DayControl day={day} today={today} onChange={setDay} />
          <SeasonScrubber day={day} onChange={setDay} />
        </div>
        {details && (
          <div className="border-b" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
            <DetailsFrame onClose={() => setSelection(null)} footer={tapsLeft}>{details}</DetailsFrame>
          </div>
        )}
        <div className="p-5 border-b" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
          <MigrationSummary {...summaryProps} />
        </div>
        <div className="p-5 space-y-6">
          <LayerToggles layers={layers} onChange={setLayers} base={base} onBase={setBase} />
          <Legend />
          <Note />
        </div>
      </aside>

      {/* Map */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="season-map absolute inset-0" aria-label="Map of waterfowl season zones and survey sites" role="region" />

        {/* Phone controls */}
        <div className="md:hidden absolute top-2 left-2 right-2 z-10 space-y-2">
          <div
            className="flex items-center gap-1.5 p-1.5 rounded-md border shadow-md"
            style={{ backgroundColor: 'rgb(var(--color-bg-primary))', borderColor: 'rgb(var(--color-border-primary))' }}
          >
            <GroupChips group={group} onChange={setGroup} compact />
            <DayControl day={day} today={today} onChange={setDay} compact />
            <button
              type="button"
              onClick={() => { setPanelOpen(o => !o); setSelection(null) }}
              aria-expanded={panelOpen}
              aria-label="Layers and map key"
              className={`chip min-h-11 min-w-11 px-0 justify-center ${panelOpen ? 'chip-on' : ''}`}
            >
              <Layers className="w-5 h-5" />
            </button>
          </div>
          {panelOpen && (
            <div
              className="p-4 rounded-md border shadow-lg space-y-5 max-h-[60dvh] overflow-y-auto"
              style={{ backgroundColor: 'rgb(var(--color-bg-primary))', borderColor: 'rgb(var(--color-border-primary))' }}
            >
              <SeasonScrubber day={day} onChange={setDay} />
              <MigrationSummary {...summaryProps} />
              <LayerToggles layers={layers} onChange={setLayers} base={base} onBase={setBase} />
              <Legend />
              <Note />
            </div>
          )}
        </div>

        {/* Status line */}
        {(loadError || noSeasonData || seasonsQ.isLoading) && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-8 md:bottom-auto md:top-3 z-10 max-w-[calc(100%-1.5rem)]">
            <div
              className="px-3 py-2 rounded-md border shadow-md text-sm"
              style={{ backgroundColor: 'rgb(var(--color-bg-primary))', borderColor: 'rgb(var(--color-border-primary))', color: 'rgb(var(--color-text-secondary))' }}
              role="status"
            >
              {loadError ? 'Season zones could not be loaded. Try again in a minute.'
                : seasonsQ.isLoading ? 'Loading season dates…'
                  : `Season dates for ${year}-${String((year + 1) % 100).padStart(2, '0')} aren't in yet.`}
            </div>
          </div>
        )}

        {/* Phone details sheet */}
        {details && (
          <div
            className="md:hidden absolute inset-x-0 bottom-0 z-20 max-h-[55%] overflow-y-auto border-t rounded-t-md shadow-2xl"
            style={{ backgroundColor: 'rgb(var(--color-bg-primary))', borderColor: 'rgb(var(--color-border-primary))', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <DetailsFrame onClose={() => setSelection(null)} footer={tapsLeft}>{details}</DetailsFrame>
          </div>
        )}
      </div>
    </div>
    {walled && <MapPaywall signedIn={isAuthenticated} billingAvailable={account?.billingAvailable ?? true} />}
    </div>
  )
}

// ---------- geojson helpers ----------

function noDatesFilter(states: string[]): maplibregl.ExpressionSpecification {
  return ['in', ['get', 'state'], ['literal', states]]
}

function hotspotFilter(group: BirdGroup): maplibregl.FilterSpecification {
  return ['==', ['get', group === 'duck' ? 'duckSeen' : 'gooseSeen'], true]
}

function emptyFc(): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: [] }
}

function pointFc(points: Array<{ lng: number; lat: number; props: Record<string, unknown> }>): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: points.map(p => ({ type: 'Feature', properties: p.props, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
  }
}

/** The survey-site dot's radius in pixels (the 'sites' layer's circle-radius, worked out in JS). */
function siteRadius(total: number): number {
  const stops: Array<[number, number]> = [[0, 4], [100, 9], [400, 18], [800, 26]]
  const x = Math.sqrt(Math.max(0, total))
  for (let i = 1; i < stops.length; i++) {
    const [x0, y0] = stops[i - 1]
    const [x1, y1] = stops[i]
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  }
  return stops[stops.length - 1][1]
}

/** A push score (0–3 in half steps) as a whole level, like the Migration page's headline. */
const pushLevel = (score: number) => Math.min(3, Math.max(0, Math.floor(score)))

/** One line per flow arrow, drawn in the direction the birds are going and kept clear of the state markers. */
function flowLines(legs: FlowLeg[]): FeatureCollection<Line> {
  return {
    type: 'FeatureCollection',
    features: legs.flatMap(l => {
      const a = STATE_CENTROIDS[l.from]
      const b = STATE_CENTROIDS[l.to]
      if (!a || !b) return []
      const at = (t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      const coords = [at(0.2), at(0.8)]
      return [{
        type: 'Feature' as const,
        properties: { flow: l.flow, from: l.from, to: l.to },
        geometry: { type: 'LineString' as const, coordinates: l.flow === 'north' ? coords.reverse() : coords },
      }]
    }),
  }
}

/** Draw an icon on a canvas at 2x and hand it to the map. Icons are lost with the style, so this runs after every style load. */
function addIcon(map: maplibregl.Map, id: string, size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (map.hasImage(id)) return
  const ratio = 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size * ratio
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(ratio, ratio)
  draw(ctx)
  map.addImage(id, ctx.getImageData(0, 0, size * ratio, size * ratio), { pixelRatio: ratio })
}

function addMigrationImages(map: maplibregl.Map, paper: string) {
  // Flow arrows point right (+x); the map turns them along the line, in the birds' direction
  const arrow = (ctx: CanvasRenderingContext2D, color: string, both: boolean) => {
    ctx.fillStyle = color
    ctx.strokeStyle = paper
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    const head = (tip: number, back: number) => {
      ctx.beginPath()
      ctx.moveTo(tip, 12)
      ctx.lineTo(back, 4)
      ctx.lineTo(back, 20)
      ctx.closePath()
      ctx.stroke()
      ctx.fill()
    }
    if (both) { head(22, 14); head(2, 10) } else head(20, 6)
  }
  addIcon(map, 'hs-flow-south', 24, ctx => arrow(ctx, FLOW_COLOR.south, false))
  addIcon(map, 'hs-flow-north', 24, ctx => arrow(ctx, FLOW_COLOR.north, false))
  addIcon(map, 'hs-flow-both', 24, ctx => arrow(ctx, FLOW_COLOR.both, true))

  // Pressure badges: a round badge with three wind lines, colored by level
  PUSH_COLOR.forEach((color, level) => addIcon(map, `hs-push-${level}`, 24, ctx => {
    ctx.beginPath()
    ctx.arc(12, 12, 10, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = paper
    ctx.stroke()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    for (const [y, x0, x1] of [[8, 6, 15], [12, 5, 18], [16, 7, 14]]) {
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
    }
  }))

  // Spike and drop badges: an up or down arrow in a circle
  const badge = (ctx: CanvasRenderingContext2D, color: string, up: boolean) => {
    ctx.beginPath()
    ctx.arc(9, 9, 7.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = paper
    ctx.stroke()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const [tip, tail] = up ? [5, 13] : [13, 5]
    ctx.beginPath()
    ctx.moveTo(9, tail)
    ctx.lineTo(9, tip)
    ctx.moveTo(6, up ? 8 : 10)
    ctx.lineTo(9, tip)
    ctx.lineTo(12, up ? 8 : 10)
    ctx.stroke()
  }
  addIcon(map, 'hs-anom-spike', 18, ctx => badge(ctx, SPIKE_COLOR, true))
  addIcon(map, 'hs-anom-drop', 18, ctx => badge(ctx, DROP_COLOR, false))
}

/** Reports arrive already rounded to a map cell, so reports in one cell share a point. */
function reportCells(reports: FieldReportPublic[]) {
  const cells = new Map<string, FieldReportPublic[]>()
  for (const r of reports) {
    const id = `report:${r.lat},${r.lng}`
    cells.set(id, [...(cells.get(id) ?? []), r])
  }
  return [...cells.entries()].map(([id, rs]) => ({ id, lat: rs[0].lat, lng: rs[0].lng, reports: rs }))
}

// ---------- controls ----------

function GroupChips({ group, onChange, compact }: { group: BirdGroup; onChange: (g: BirdGroup) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Birds" className="flex gap-1.5 shrink-0">
      {(['duck', 'goose'] as const).map(g => (
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={group === g}
          onClick={() => onChange(g)}
          className={`chip ${compact ? 'min-h-11 px-3' : 'min-h-10 px-4'} ${group === g ? 'chip-on' : ''}`}
        >
          {g === 'duck' ? 'Ducks' : 'Geese'}
        </button>
      ))}
    </div>
  )
}

function DayControl({ day, today, onChange, compact }: { day: string; today: string; onChange: (d: string) => void; compact?: boolean }) {
  const label = fmtDay(day)
  if (compact) {
    return (
      <div className="flex items-center flex-1 min-w-0 justify-center">
        <button type="button" onClick={() => onChange(addDays(day, -1))} aria-label="Previous day" className="min-h-11 min-w-9 flex items-center justify-center" style={{ color: 'rgb(var(--color-text-secondary))' }}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <label className="relative flex-1 min-w-0 text-center">
          <span className="font-mono text-sm font-medium whitespace-nowrap" style={{ color: 'rgb(var(--color-text-primary))' }}>
            {day === today ? 'Today' : label}
          </span>
          <input
            type="date"
            value={day}
            onChange={e => e.target.value && onChange(e.target.value)}
            aria-label="Date"
            className="absolute inset-0 opacity-0 w-full"
          />
        </label>
        <button type="button" onClick={() => onChange(addDays(day, 1))} aria-label="Next day" className="min-h-11 min-w-9 flex items-center justify-center" style={{ color: 'rgb(var(--color-text-secondary))' }}>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow">Date</span>
        {day !== today && (
          <button type="button" onClick={() => onChange(today)} className="text-sm font-semibold text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">
            Today
          </button>
        )}
      </div>
      <div className="flex items-stretch gap-1.5">
        <button type="button" onClick={() => onChange(addDays(day, -1))} aria-label="Previous day" className="btn-secondary px-2.5">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input
          type="date"
          value={day}
          onChange={e => e.target.value && onChange(e.target.value)}
          aria-label="Date"
          className="input flex-1 min-w-0 font-mono text-sm"
        />
        <button type="button" onClick={() => onChange(addDays(day, 1))} aria-label="Next day" className="btn-secondary px-2.5">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <p className="mt-2 text-sm font-medium" style={{ color: 'rgb(var(--color-text-primary))' }}>{fmtDay(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
    </div>
  )
}

/** A slider across the season, September through March. */
function SeasonScrubber({ day, onChange }: { day: string; onChange: (d: string) => void }) {
  const year = seasonYearOf(day)
  const start = `${year}-09-01`
  const end = `${year + 1}-03-31`
  const span = Math.round((parseCalendarDate(end).getTime() - parseCalendarDate(start).getTime()) / 86_400_000)
  const offset = Math.round((parseCalendarDate(day).getTime() - parseCalendarDate(start).getTime()) / 86_400_000)
  const inRange = offset >= 0 && offset <= span
  return (
    <div>
      <label htmlFor="season-scrubber" className="eyebrow block mb-2">Through the season</label>
      <input
        id="season-scrubber"
        type="range"
        min={0}
        max={span}
        value={inRange ? offset : offset < 0 ? 0 : span}
        onChange={e => onChange(addDays(start, Number(e.target.value)))}
        className="w-full accent-[rgb(var(--color-accent))]"
      />
      <div className="flex justify-between font-mono text-xs mt-1" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
        <span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span>
      </div>
    </div>
  )
}

function LayerToggles({ layers, onChange, base, onBase }: {
  layers: Record<LayerKey, boolean>
  onChange: (l: Record<LayerKey, boolean>) => void
  base: Base
  onBase: (b: Base) => void
}) {
  const rows: Array<[LayerKey, string]> = [
    ['zones', 'Season zones'],
    ['flow', 'Migration status and flyway flow'],
    ['pressure', 'Migration pressure (weather push)'],
    ['spikes', 'Count spikes and drops'],
    ['sites', 'Survey sites'],
    ['hotspots', 'eBird hotspots (last 14 days)'],
    ['ebird', 'eBird areas HuntStack watches'],
    ['reports', 'Hunter reports (last 7 days)'],
  ]
  return (
    <div>
      <p className="eyebrow mb-2">Layers</p>
      <div className="space-y-0.5">
        {rows.map(([k, label]) => (
          <label key={k} className="flex items-center gap-3 min-h-10 cursor-pointer text-sm" style={{ color: 'rgb(var(--color-text-primary))' }}>
            <input
              type="checkbox"
              checked={layers[k]}
              onChange={e => onChange({ ...layers, [k]: e.target.checked })}
              className="w-4 h-4 accent-[rgb(var(--color-accent))]"
            />
            {label}
          </label>
        ))}
      </div>
      <div role="radiogroup" aria-label="Base map" className="flex gap-1.5 mt-3">
        {(['map', 'satellite'] as const).map(b => (
          <button key={b} type="button" role="radio" aria-checked={base === b} onClick={() => onBase(b)} className={`chip min-h-10 px-4 ${base === b ? 'chip-on' : ''}`}>
            {b === 'map' ? 'Map' : 'Satellite'}
          </button>
        ))}
      </div>
    </div>
  )
}

function Legend() {
  const { resolvedTheme } = useThemeStore()
  const t = resolvedTheme === 'dark' ? FILL.dark : FILL.light
  const swatch = (color: string, opacity: number) => (
    <span className="inline-block w-4 h-4 rounded-sm border shrink-0" style={{ backgroundColor: color, opacity, borderColor: 'rgb(var(--color-border-primary))' }} />
  )
  const row = (icon: ReactNode, label: string) => (
    <li className="flex items-center gap-2.5 text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>{icon}{label}</li>
  )
  return (
    <div>
      <p className="eyebrow mb-2">Map key</p>
      <ul className="space-y-2">
        {row(swatch(t.open, 0.6), 'Regular season open')}
        {row(swatch(t.special, 0.6), 'Special season only (teal, youth, veterans, falconry)')}
        {row(swatch(t.closed, 0.35), 'Closed')}
        {row(<span className="inline-block w-4 h-4 rounded-sm border-2 border-dashed shrink-0" style={{ borderColor: 'rgb(var(--color-text-tertiary))' }} />, 'Zone outline only: no season dates in HuntStack yet')}
        <li className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
          <span className="flex items-center gap-2.5">
            <span className="flex gap-0.5 shrink-0">
              {(['arriving', 'building', 'peak', 'declining', 'departing'] as const).map(s => (
                <span key={s} className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_HEX[s] }} />
              ))}
            </span>
            State's migration status
          </span>
          <span className="block mt-0.5 ml-0.5 text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
            Arriving, building, peak, declining, departing (gray: no current survey)
          </span>
        </li>
        {row(
          <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0" aria-hidden="true">
            <line x1="1" y1="8" x2="10" y2="8" stroke={FLOW_COLOR.south} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M15 8 L9 3.5 L9 12.5 Z" fill={FLOW_COLOR.south} />
          </svg>,
          'Flyway flow: green south, blue north, gold both ways',
        )}
        {row(
          <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="11" fill={PUSH_COLOR[2]} />
            <path d="M6 8 H15 M5 12 H18 M7 16 H14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>,
          'Migration pressure: gray calm, then gold, orange, red',
        )}
        {row(
          <span className="flex gap-0.5 shrink-0">
            <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8.5" fill={SPIKE_COLOR} /><path d="M9 13 V5 M6 8 L9 5 L12 8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8.5" fill={DROP_COLOR} /><path d="M9 5 V13 M6 10 L9 13 L12 10" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>,
          'Count spike (up 30%+) or drop (down 40%+) at a survey site',
        )}
        {row(<span className="inline-block w-4 h-4 rounded-full shrink-0 bg-earth-900 dark:bg-earth-100" />, 'Survey site, sized by latest count')}
        {row(<span className="inline-block w-4 h-4 rounded-full shrink-0 border-2 border-earth-500" />, 'Survey site, older survey')}
        {row(<span className="inline-block w-3 h-3 mx-0.5 rounded-full shrink-0" style={{ backgroundColor: EBIRD_COLOR, opacity: 0.75 }} />, 'eBird hotspot, sized by birds reported (birder sightings, not a survey)')}
        {row(<span className="inline-block w-4 h-4 rounded-full shrink-0 border-[2.5px]" style={{ borderColor: EBIRD_COLOR }} />, 'eBird area HuntStack watches')}
        {row(<span className="inline-block w-4 h-4 rounded-full shrink-0 border-[1.5px]" style={{ borderColor: EBIRD_COLOR, opacity: 0.5 }} />, 'eBird area, nothing reported in 14 days')}
        {row(<span className="inline-block w-3 h-3 mx-0.5 rounded-full shrink-0" style={{ backgroundColor: REPORT_COLOR }} />, 'Hunter report (unverified)')}
      </ul>
    </div>
  )
}

function Note() {
  return (
    <p className="text-xs leading-relaxed" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
      Zone lines are approximate. Season zones are drawn for Texas, Kansas, Oklahoma, New Mexico, Louisiana,
      Arkansas, Missouri, Illinois and Iowa. Check the state's regulations before you hunt.
    </p>
  )
}

// ---------- details ----------

function DetailsFrame({ children, onClose, footer }: { children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  return (
    <div className="relative p-5">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="absolute top-3 right-3 min-h-11 min-w-11 flex items-center justify-center rounded-md hover:bg-earth-100 dark:hover:bg-earth-800"
        style={{ color: 'rgb(var(--color-text-secondary))' }}
      >
        <X className="w-5 h-5" />
      </button>
      {children}
      {footer}
    </div>
  )
}

/** Under a detail, for visitors and free accounts: how many free taps are left today */
function TapsLeft({ used, signedIn }: { used: number; signedIn: boolean }) {
  const left = Math.max(0, MAP_FREE_TAPS - used)
  return (
    <p className="mt-4 pt-3 border-t text-xs" style={{ borderColor: 'rgb(var(--color-border-primary))', color: 'rgb(var(--color-text-tertiary))' }}>
      {left} of {MAP_FREE_TAPS} free map taps left today.{' '}
      <Link to="/settings" className="font-semibold text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">
        {signedIn ? 'Go Pro' : 'Sign up for Pro'}
      </Link>{' '}
      for the full map.
    </p>
  )
}

/** Over the blurred map once today's free taps are used */
function MapPaywall({ signedIn, billingAvailable }: { signedIn: boolean; billingAvailable: boolean }) {
  const promptAuth = useAuthStore(s => s.promptAuth)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subscribe = async () => {
    setBusy(true)
    setError(null)
    try {
      const { url } = await startCheckout()
      window.location.assign(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ backgroundColor: 'rgb(var(--color-bg-primary) / 0.35)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="map-wall-title" className="card w-full max-w-sm p-6 shadow-2xl text-center">
        <Lock className="w-8 h-8 mx-auto mb-3 text-accent-500" />
        <h2 id="map-wall-title" className="text-lg font-semibold tracking-tight" style={{ color: 'rgb(var(--color-text-primary))' }}>
          You've used today's free map taps
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
          The map opens {MAP_FREE_TAPS} details a day for free. HuntStack Pro unlocks the full map, plus unlimited AI questions, for $5.99/month.
        </p>
        {signedIn ? (
          billingAvailable ? (
            <button type="button" onClick={subscribe} disabled={busy} className="btn-primary w-full mt-5 disabled:opacity-60">
              {busy ? 'Opening checkout…' : 'Subscribe for $5.99/month'}
            </button>
          ) : (
            <p className="mt-5 text-sm" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Subscriptions are coming soon.</p>
          )
        ) : (
          <div className="mt-5 space-y-2">
            <button type="button" onClick={() => promptAuth('signup')} className="btn-primary w-full">Create free account to subscribe</button>
            <button type="button" onClick={() => promptAuth('signin')} className="btn-outline w-full">Sign in</button>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p className="mt-4 text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
          Free taps come back tomorrow. Migration counts stay free on the{' '}
          <Link to="/migration" className="text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">Migration page</Link>.
        </p>
      </div>
    </div>
  )
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="pr-10 mb-4">
      <p className="eyebrow mb-1">{eyebrow}</p>
      <h2 className="text-lg font-semibold tracking-tight leading-snug" style={{ color: 'rgb(var(--color-text-primary))' }}>{title}</h2>
    </div>
  )
}

function StatusBadge({ status }: { status: ZoneStatus }) {
  const cls = status === 'open' ? 'bg-forest-50 text-forest-700 border-forest-200 dark:bg-forest-950 dark:text-forest-400 dark:border-forest-800'
    : status === 'special' ? 'bg-[#fbf3dc] text-[#7a5a0c] border-[#ecd9a0] dark:bg-[#2a2210] dark:text-[#e0b84a] dark:border-[#5a4818]'
      : 'bg-earth-100 text-earth-700 border-earth-200 dark:bg-earth-800 dark:text-earth-300 dark:border-earth-700'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-xs font-semibold uppercase tracking-wide ${cls}`}>{STATUS_TEXT[status]}</span>
}

function ZoneDetails({ zone, seasons, group, day, children }: { zone: ZoneProperties; seasons: MapSeason[]; group: BirdGroup; day: string; children?: ReactNode }) {
  const mine = dedupeSeasons(seasonsForZone(seasons, zone, group))
  const status = zoneStatus(mine, day)
  const change = nextChange(mine, day)
  const zoneName = group === 'duck' ? zone.duckZone : zone.gooseZone
  const source = safeHttpUrl(mine.find(s => s.sourceUrl)?.sourceUrl ?? AGENCY_PAGES[zone.state] ?? null)
  const stateHasDates = seasons.some(s => s.state === zone.state)
  return (
    <div>
      <Heading eyebrow={`${STATE_NAMES[zone.state] ?? zone.state} · ${group === 'duck' ? 'Ducks' : 'Geese'}`} title={zoneName === 'Statewide' ? 'Statewide' : zoneName} />
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <StatusBadge status={status} />
        <span className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>{fmtDay(day)}</span>
      </div>
      {(change.closes || change.opens) && (
        <p className="text-sm mb-4" style={{ color: 'rgb(var(--color-text-secondary))' }}>
          {change.closes ? `Regular season runs through ${fmtDay(change.closes, { month: 'short', day: 'numeric' })}` : `Regular season opens ${fmtDay(change.opens!, { month: 'short', day: 'numeric' })}`}
        </p>
      )}
      {mine.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
          {stateHasDates
            ? 'No season dates for this zone yet.'
            : `HuntStack has survey counts for ${STATE_NAMES[zone.state] ?? zone.state} but not its season dates yet. The zone line is shown so you can see which zone you're in; check the agency for dates.`}
        </p>
      ) : (
        <ul className="border-t" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
          {mine.map(s => {
            const on = isOpenOn(s, day)
            return (
              <li key={`${s.name}|${s.start}`} className="py-2.5 border-b" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`text-sm ${on ? 'font-semibold' : ''}`} style={{ color: 'rgb(var(--color-text-primary))' }}>
                    {s.name}
                    {isSpecialSeason(s) && <span className="ml-1.5 text-xs font-normal" style={{ color: 'rgb(var(--color-text-tertiary))' }}>special</span>}
                  </span>
                  {on && <span className="mt-1 w-2 h-2 rounded-full bg-forest-500 shrink-0" aria-label="Open on this date" />}
                </div>
                <div className="mt-0.5 font-mono text-xs" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                  {fmtRange(s)}{s.bagDaily != null ? ` · ${s.bagDaily} daily` : ''}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        {stateHasDates && (
          <Link to={`/regulations/${zone.state}`} className="text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">Full regulations →</Link>
        )}
        {source && (
          <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">
            Agency source <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      <p className="mt-4 text-xs leading-relaxed" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
        Zone line from {zone.source}. Approximate: check the regulations for the exact boundary.
      </p>
      {children}
    </div>
  )
}

const INDEX_BAR = (score: number) => score >= 76 ? 'bg-red-500' : score >= 51 ? 'bg-orange-400' : score >= 26 ? 'bg-amber-400' : 'bg-earth-400'
const PUSH_TEXT = [
  'text-earth-500 dark:text-earth-400',
  'text-amber-600 dark:text-amber-400',
  'text-orange-600 dark:text-orange-400',
  'text-red-600 dark:text-red-400',
]

/** Which way the arrows mostly point, in the Migration page's words. */
function flowSummary(legs: FlowLeg[]): { label: string; arrow: string; color: string } {
  const south = legs.filter(l => l.flow === 'south').length
  const north = legs.filter(l => l.flow === 'north').length
  if (south >= 2) return { label: 'Southward movement', arrow: '↓', color: FLOW_COLOR.south }
  if (north >= 2) return { label: 'Northward movement', arrow: '↑', color: FLOW_COLOR.north }
  return { label: 'Mixed / stalled', arrow: '↔', color: 'rgb(var(--color-text-tertiary))' }
}

/** The Migration page's headline numbers (all flyways and species), for the sidebar and the phone panel. */
function MigrationSummary({ ready, index, pushLevel, pushKnown, legs, spikes, drops }: {
  ready: boolean
  index: MigrationIndexResult
  pushLevel: number
  pushKnown: boolean
  legs: FlowLeg[]
  spikes: number
  drops: number
}) {
  const flow = flowSummary(legs)
  const label = 'text-xs' as const
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="eyebrow">Migration now</p>
        <Link to="/migration" className="text-sm font-semibold text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">Details →</Link>
      </div>
      {!ready ? (
        <p className="text-sm" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Loading migration…</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="col-span-2">
            <dt className={label} style={{ color: 'rgb(var(--color-text-tertiary))' }}>Migration Index</dt>
            <dd className="flex items-center gap-3">
              <span className={`font-mono text-2xl font-medium ${index.labelColor}`}>{index.score}</span>
              <span className={`text-sm font-semibold ${index.labelColor}`}>{index.label}</span>
              <span className="flex-1 h-1.5 rounded-sm bg-earth-200 dark:bg-earth-700 overflow-hidden" aria-hidden="true">
                <span className={`block h-full rounded-sm ${INDEX_BAR(index.score)}`} style={{ width: `${index.score}%` }} />
              </span>
            </dd>
          </div>
          <div>
            <dt className={label} style={{ color: 'rgb(var(--color-text-tertiary))' }}>Pressure</dt>
            <dd className={`text-sm font-semibold ${PUSH_TEXT[pushLevel]}`}>
              {pushKnown ? `${PUSH_SCORE_LABELS[pushLevel]}${pushLevel === 0 ? ', calm' : ''}` : 'Not available'}
            </dd>
          </div>
          <div>
            <dt className={label} style={{ color: 'rgb(var(--color-text-tertiary))' }}>Flyway flow</dt>
            <dd className="text-sm font-semibold" style={{ color: 'rgb(var(--color-text-primary))' }}>
              <span className="mr-1" style={{ color: flow.color }} aria-hidden="true">{flow.arrow}</span>{flow.label}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className={label} style={{ color: 'rgb(var(--color-text-tertiary))' }}>Survey sites with a spike or drop</dt>
            <dd className="text-sm" style={{ color: 'rgb(var(--color-text-primary))' }}>
              <span className="font-semibold" style={{ color: SPIKE_COLOR }}>{spikes} spike{spikes === 1 ? '' : 's'}</span>
              {' · '}
              <span className="font-semibold" style={{ color: DROP_COLOR }}>{drops} drop{drops === 1 ? '' : 's'}</span>
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

function pushSignals(f: PushFactor): string[] {
  return [
    f.coldFrontPresent && 'Cold front present',
    f.coldFrontIncoming && 'Front incoming (48h)',
    f.windIsFromNorth && `North winds${f.windDirection ? ` (${f.windDirection})` : ''}`,
    f.temperature !== null && f.temperature < 32 && 'Sub-freezing',
  ].filter((s): s is string => !!s)
}

/** One state's migration: status, index, pressure, flow arrows and spikes, as on the Migration page with that state picked. */
function StateMigration({ info, compact }: { info: StateMigrationInfo; compact?: boolean }) {
  const { state, group: g, index, push, regions, legs } = info
  const name = STATE_NAMES[state] ?? state
  const nameOf = (code: string) => STATE_NAMES[code] ?? code
  const status = g && !g.allStale ? g.dominantStatus : null
  const anomalies = (g?.refuges ?? []).filter(r => r.topAnomaly)
  const muted = { color: 'rgb(var(--color-text-tertiary))' }
  const body = { color: 'rgb(var(--color-text-secondary))' }
  const pushRow = (f: PushFactor, label: string) => {
    const level = pushLevel(f.pushScore)
    const signals = pushSignals(f)
    return (
      <li key={f.regionId ?? f.stateCode} className="py-2 border-b text-sm" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: 'rgb(var(--color-text-primary))' }}>{label}</span>
          <span className={`font-semibold ${PUSH_TEXT[level]}`}>{PUSH_SCORE_LABELS[level]}</span>
        </div>
        <div className="mt-0.5 text-xs" style={muted}>
          {signals.length > 0 ? signals.join(' · ') : 'No push signals'}
          {f.temperature !== null ? ` · ${f.temperature}°${f.temperatureUnit ?? 'F'}` : ''}
        </div>
      </li>
    )
  }
  return (
    <div className={compact ? 'mt-5 pt-4 border-t' : ''} style={compact ? { borderColor: 'rgb(var(--color-border-primary))' } : undefined}>
      {compact ? <p className="eyebrow mb-2">Migration in {name}</p> : <Heading eyebrow={`${name} · Migration`} title={name} />}
      {!g ? (
        <p className="text-sm mb-3" style={body}>No survey counts or eBird areas for {name} yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-xs font-semibold uppercase tracking-wide" style={{ borderColor: 'rgb(var(--color-border-primary))', color: 'rgb(var(--color-text-primary))' }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_HEX[status ?? 'none'] }} />
              {status ? STATUS_LABELS[status] : 'No current survey'}
            </span>
            {index && (
              <span className={`text-sm font-semibold ${index.labelColor}`}>Index {index.score}/100 · {index.label}</span>
            )}
          </div>
          <p className="text-sm mb-3" style={body}>
            {g.allStale
              ? `Newest count: ${oldSurveyLabel(g.latestDate)}. Not current.`
              : (() => {
                const places = g.refuges.filter(r => !r.isStale).length
                return `${fmtNum(g.freshTotalBirds)} birds at ${places} place${places === 1 ? '' : 's'} with current counts (surveys and eBird areas).`
              })()}
          </p>
        </>
      )}

      {legs.length > 0 && (
        <>
          <p className="text-xs font-medium mb-1" style={muted}>Flyway flow</p>
          <ul className="mb-3 space-y-1 text-sm" style={body}>
            {legs.map(l => (
              <li key={`${l.from}-${l.to}`} className="flex items-center gap-2">
                <span className="font-bold" style={{ color: FLOW_COLOR[l.flow] }} aria-hidden="true">{l.flow === 'south' ? '↓' : l.flow === 'north' ? '↑' : '↕'}</span>
                {l.flow === 'south' ? `Southward, ${nameOf(l.from)} to ${nameOf(l.to)}`
                  : l.flow === 'north' ? `Northward, ${nameOf(l.to)} to ${nameOf(l.from)}`
                    : `Active in both ${nameOf(l.from)} and ${nameOf(l.to)}`}
              </li>
            ))}
          </ul>
        </>
      )}

      {(push || regions.length > 0) && (
        <>
          <p className="text-xs font-medium mb-1" style={muted}>Migration pressure</p>
          <ul className="border-t mb-3" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
            {push && pushRow(push, compact ? 'Statewide' : name)}
            {regions.map(r => pushRow(r, r.regionName ?? r.regionId ?? name))}
          </ul>
        </>
      )}

      {anomalies.length > 0 && (
        <>
          <p className="text-xs font-medium mb-1" style={muted}>Spikes and drops</p>
          <ul className="border-t mb-3" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
            {anomalies.slice(0, 6).map(r => {
              const item = r.items.find(i => i.anomaly === r.topAnomaly)
              return (
                <li key={r.refugeId} className="py-2 border-b text-sm flex items-center justify-between gap-3" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
                  <span style={{ color: 'rgb(var(--color-text-primary))' }}>{r.refugeName}</span>
                  <span className="font-mono text-xs text-right" style={{ color: r.topAnomaly === 'spike' ? SPIKE_COLOR : DROP_COLOR }}>
                    {item ? `${item.speciesName} ${item.deltaPercent != null ? formatChange(item.deltaPercent, 0) : ''}` : r.topAnomaly}
                  </span>
                </li>
              )
            })}
          </ul>
          {anomalies.length > 6 && <p className="text-xs mb-3" style={muted}>And {anomalies.length - 6} more.</p>}
        </>
      )}

      <div className="text-sm font-semibold">
        <Link to={`/migration?state=${state}`} className="text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">Migration in {name} →</Link>
      </div>
    </div>
  )
}

/** Statewide eBird activity for the chosen birds: places reporting each species and birds reported. */
function StateEbird({ state, group, rows, covered, loaded }: { state: string; group: BirdGroup; rows: StateSpecies[]; covered: boolean; loaded: boolean }) {
  if (!loaded) return null
  const stateName = STATE_NAMES[state] ?? state
  const mine = rows.filter(r => r.state === state && groupForSpecies(r.species) === group).sort((a, b) => b.birds - a.birds)
  return (
    <div className="mt-5 pt-4 border-t" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
      <p className="eyebrow mb-1">eBird in {stateName}, last 14 days</p>
      {!covered ? (
        <p className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>HuntStack doesn't collect eBird reports for {stateName} yet.</p>
      ) : mine.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>No {group === 'duck' ? 'duck' : 'goose'} reports statewide.</p>
      ) : (
        <>
          <p className="text-xs mb-2" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Statewide, not just this zone. Birds in each place's latest report, added up.</p>
          <ul className="border-t" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
            {mine.slice(0, 6).map(r => (
              <li key={r.species} className="py-2 border-b text-sm" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'rgb(var(--color-text-primary))' }}>{r.speciesName}</span>
                  <span className="font-mono" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                    {fmtNum(r.birds)}
                    {r.deltaPercent != null && <span className="ml-2 text-xs">{r.deltaPercent >= 0 ? '+' : ''}{Math.round(r.deltaPercent)}%</span>}
                  </span>
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                  {r.places} place{r.places === 1 ? '' : 's'}{r.topPlaces[0] ? ` · most at ${r.topPlaces[0].name} (${fmtNum(r.topPlaces[0].count)})` : ''}
                </div>
              </li>
            ))}
          </ul>
          {mine.some(r => r.deltaPercent != null) && (
            <p className="mt-2 text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>Change compared with two weeks earlier.</p>
          )}
        </>
      )}
    </div>
  )
}

function EbirdRows({ rows }: { rows: Array<{ key: string; name: string; count: number | null; date: string }> }) {
  return (
    <ul className="border-t" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
      {rows.map(c => (
        <li key={c.key} className="py-2 border-b flex items-center justify-between gap-3 text-sm" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
          <span style={{ color: 'rgb(var(--color-text-primary))' }}>{c.name}</span>
          <span className="font-mono" style={{ color: 'rgb(var(--color-text-secondary))' }}>
            {c.count == null ? 'seen' : fmtNum(c.count)} <span className="text-xs">{fmtDay(c.date, { month: 'short', day: 'numeric' })}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function SiteDetails({ site, day, ebird }: { site: Site; day: string; ebird: CountRow[] }) {
  const surveyed = site.isStale ? oldSurveyLabel(site.latestDate) : `Surveyed ${fmtDay(site.latestDate, { month: 'short', day: 'numeric' })}`
  const hunt = new URLSearchParams({ states: site.state, go: '1' })
  if (day !== isoDay(new Date())) hunt.set('date', day)
  return (
    <div>
      <Heading eyebrow={`${STATE_NAMES[site.state] ?? site.state} · Survey site`} title={site.name} />
      <div className="flex items-baseline gap-3 mb-1">
        <span className="font-mono text-2xl font-medium" style={{ color: 'rgb(var(--color-text-primary))' }}>{fmtNum(site.total)}</span>
        <span className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>birds counted</span>
        {site.changePercent != null && !site.isStale && (
          <span className={`font-mono text-sm ${site.changePercent >= 0 ? 'text-forest-600 dark:text-forest-400' : 'text-accent-600 dark:text-accent-400'}`}>
            {site.changePercent >= 0 ? '+' : ''}{site.changePercent}%
          </span>
        )}
      </div>
      <p className="text-sm mb-4" style={{ color: 'rgb(var(--color-text-secondary))' }}>
        {surveyed}{site.isStale ? ' · not in current totals' : site.changePercent != null ? ' · change since the previous survey' : ''}
      </p>
      {site.anomaly && (() => {
        const hits = site.species.filter(c => getAnomaly(c.count, c.deltaPercent, c.previousCount) === site.anomaly)
        const spike = site.anomaly === 'spike'
        return (
          <p className="text-sm mb-4 flex items-start gap-2" style={{ color: 'rgb(var(--color-text-primary))' }}>
            <span className="mt-0.5 shrink-0 font-bold" style={{ color: spike ? SPIKE_COLOR : DROP_COLOR }} aria-hidden="true">{spike ? '▲' : '▼'}</span>
            <span>
              <span className="font-semibold">{spike ? 'Count spike' : 'Count drop'}:</span>{' '}
              {hits.map(c => `${c.speciesName} ${c.deltaPercent != null ? formatChange(c.deltaPercent, 0) : ''}`).join(', ')}
            </span>
          </p>
        )
      })()}
      <ul className="border-t" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
        {site.species.slice(0, 8).map(c => (
          <li key={`${c.species}|${c.surveyDate}`} className="py-2 border-b flex items-center justify-between gap-3 text-sm" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
            <span style={{ color: 'rgb(var(--color-text-primary))' }}>{c.speciesName}</span>
            <span className="font-mono" style={{ color: 'rgb(var(--color-text-secondary))' }}>
              {fmtNum(c.count)}
              {c.deltaPercent != null && !site.isStale && <span className="ml-2 text-xs">{c.deltaPercent >= 0 ? '+' : ''}{Math.round(c.deltaPercent)}%</span>}
            </span>
          </li>
        ))}
      </ul>
      {site.species.length > 8 && (
        <p className="mt-2 text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>And {site.species.length - 8} more species.</p>
      )}
      {ebird.length > 0 && (
        <div className="mt-5">
          <p className="eyebrow mb-1">eBird nearby, last 14 days</p>
          <p className="text-xs mb-2" style={{ color: 'rgb(var(--color-text-tertiary))' }}>The latest birder report of each species around here. Not part of the survey count.</p>
          <EbirdRows rows={ebird.slice(0, 8).map(c => ({ key: c.species, name: c.speciesName, count: c.count, date: c.surveyDate }))} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        <Link to={`/where-to-hunt?${hunt}`} className="text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">Where to Hunt in {site.state} →</Link>
        <Link to="/migration" className="text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">Migration →</Link>
      </div>
    </div>
  )
}

function EbirdDetails({ place }: { place: EbirdArea }) {
  return (
    <div>
      <Heading eyebrow={`${STATE_NAMES[place.state] ?? place.state} · eBird area`} title={place.name} />
      {place.quiet ? (
        <p className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
          Checked on eBird: no reports of 5 or more ducks or geese around here in the last 14 days.
        </p>
      ) : (
        <>
          <p className="text-sm mb-4" style={{ color: 'rgb(var(--color-text-secondary))' }}>
            The latest birder report of each species around here in the last 14 days (5 or more birds). What people reported seeing, not a survey count.
          </p>
          <EbirdRows rows={place.rows.slice(0, 10).map(c => ({ key: c.species, name: c.speciesName, count: c.count, date: c.surveyDate }))} />
        </>
      )}
    </div>
  )
}

function HotspotDetails({ spot, group }: { spot: Hotspot; group: BirdGroup }) {
  // The chosen birds first, then the rest
  const rows = [...spot.reports.filter(r => r.group === group), ...spot.reports.filter(r => r.group !== group)]
  const page = /^L\d+$/.test(spot.id) ? `https://ebird.org/hotspot/${spot.id}` : null
  return (
    <div>
      <Heading eyebrow={`${STATE_NAMES[spot.state] ?? spot.state} · eBird hotspot`} title={spot.name} />
      <p className="text-sm mb-4" style={{ color: 'rgb(var(--color-text-secondary))' }}>
        The latest birder report of each duck and goose species here in the last 14 days. What people reported seeing, not a survey count.
      </p>
      <EbirdRows rows={rows.map(r => ({ key: r.slug, name: r.name, count: r.count, date: r.date }))} />
      {page && (
        <div className="mt-4 text-sm font-semibold">
          <a href={page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-600 dark:text-accent-400 hover:underline underline-offset-4">
            Hotspot on eBird <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  )
}

function ReportDetails({ reports }: { reports: FieldReportPublic[] }) {
  const sorted = reports.slice().sort((a, b) => b.observedAt.localeCompare(a.observedAt))
  return (
    <div>
      <Heading eyebrow="Hunter reports · unverified" title={`${reports.length} report${reports.length === 1 ? '' : 's'} near here`} />
      <p className="text-sm mb-4" style={{ color: 'rgb(var(--color-text-secondary))' }}>
        From HuntStack users in the last 7 days. Locations are rounded, and reports are not checked.
      </p>
      <ul className="border-t" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
        {sorted.map(r => (
          <li key={r.id} className="py-2 border-b text-sm" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: 'rgb(var(--color-text-primary))' }}>{r.speciesLabel}</span>
              <span className="font-mono" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                {r.countExact != null ? fmtNum(r.countExact) : COUNT_BUCKETS.find(b => b.value === r.countBucket)?.label ?? r.countBucket}
              </span>
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
              {new Date(r.observedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {r.activity ? ` · ${ACTIVITIES.find(a => a.value === r.activity)?.label ?? r.activity}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
