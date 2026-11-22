// GET /api/hunt/rivers: each river gauge's latest flow against its normal for this time of year
// (lib/rivers.ts), for the Map's river layer. Gauges and their normals: src/data/river-gauges.ts
// (scripts/build-river-gauges.py). Latest and daily flows: USGS Water Data OGC API, asked once an
// hour for all gauges at once; a failed refresh keeps serving the last good answer for a while.

import type { FastifyPluginAsync } from 'fastify'
import { BoundedCache } from '../lib/cache.js'
import { RIVER_GAUGES } from '../data/river-gauges.js'
import { flowClass, flowDaysAgo, flowPercentile, flowTrend, halfMonthOf, type FlowClass, type FlowTrend } from '../lib/rivers.js'

const USGS = 'https://api.waterdata.usgs.gov/ogcapi/v0/collections'
const UA = '(HuntStack, huntstack.net)'
const BATCH = 100
const FETCH_TIMEOUT_MS = 20_000
const CACHE_MS = 60 * 60 * 1000
const STALE_OK_MS = 12 * 60 * 60 * 1000
/** A reading older than this is a gauge that has stopped reporting (ice, equipment) */
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000

export interface RiverGauge {
  id: string
  name: string
  state: string
  lat: number
  lng: number
  drainageSqMi: number
  yearsOfRecord: number
  cfs: number
  time: string
  /** USGS's median flow for this half-month */
  normalCfs: number
  flowClass: FlowClass
  /** Roughly where today's flow sits in the record for this time of year (5 = under 10th, 95 = over 90th) */
  percentile: number
  trend: FlowTrend
  /** Change from the mean daily flow about a week ago */
  changePercent: number | null
}

export interface RiversResponse {
  gauges: RiverGauge[]
  updated: string
  source: string
}

const cache = new BoundedCache<{ at: number; data: RiversResponse }>(1)
// One refresh at a time: requests that arrive while USGS is being asked wait for that answer
let inflight: Promise<RiversResponse> | null = null

type Feature = { properties: { monitoring_location_id: string; time: string; value: string | null } }

async function fetchFeatures(collection: string, query: Record<string, string>, ids: string[]): Promise<Feature[]> {
  const out: Feature[] = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const params = new URLSearchParams({
      f: 'json', parameter_code: '00060', limit: '10000', properties: 'monitoring_location_id,time,value',
      monitoring_location_id: ids.slice(i, i + BATCH).map(id => `USGS-${id}`).join(','),
      ...query,
    })
    const res = await fetch(`${USGS}/${collection}/items?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`USGS ${collection} answered ${res.status}`)
    const body = await res.json() as { features?: Feature[] }
    out.push(...(body.features ?? []))
  }
  return out
}

export async function loadRivers(now = new Date()): Promise<RiversResponse> {
  const ids = RIVER_GAUGES.map(g => g[0])
  const since = new Date(now.getTime() - 10 * 86_400_000).toISOString().slice(0, 10)
  const [latest, daily] = await Promise.all([
    fetchFeatures('latest-continuous', {}, ids),
    // The week-ago comparison is a nicety: without it the layer still shows
    fetchFeatures('daily', { statistic_id: '00003', datetime: `${since}/..` }, ids).catch(() => [] as Feature[]),
  ])
  const latestById = new Map<string, { cfs: number; time: string }>()
  for (const f of latest) {
    const v = Number(f.properties.value)
    if (f.properties.value === null || !Number.isFinite(v) || v < 0) continue
    latestById.set(f.properties.monitoring_location_id.replace(/^USGS-/, ''), { cfs: v, time: f.properties.time })
  }
  const dailyById = new Map<string, Map<string, number>>()
  for (const f of daily) {
    const v = Number(f.properties.value)
    if (f.properties.value === null || !Number.isFinite(v)) continue
    const id = f.properties.monitoring_location_id.replace(/^USGS-/, '')
    if (!dailyById.has(id)) dailyById.set(id, new Map())
    dailyById.get(id)!.set(f.properties.time.slice(0, 10), v)
  }

  const k = halfMonthOf(now)
  const gauges: RiverGauge[] = []
  for (const [id, name, state, lat, lng, drainageSqMi, yearsOfRecord, p10s, p25s, p50s, p75s, p90s] of RIVER_GAUGES) {
    const reading = latestById.get(id)
    if (!reading || now.getTime() - Date.parse(reading.time) > MAX_AGE_MS) continue
    const [p10, p25, p50, p75] = [p10s[k], p25s[k], p50s[k], p75s[k]]
    if (p10 === null || p25 === null || p50 === null || p75 === null) continue
    const pcts = { p10, p25, p50, p75, p90: p90s?.[k] ?? null }
    const { trend, changePercent } = flowTrend(reading.cfs, flowDaysAgo(dailyById.get(id) ?? new Map(), now, 7))
    gauges.push({
      id, name, state, lat, lng, drainageSqMi, yearsOfRecord,
      cfs: reading.cfs, time: reading.time, normalCfs: p50,
      flowClass: flowClass(reading.cfs, pcts), percentile: flowPercentile(reading.cfs, pcts),
      trend, changePercent,
    })
  }
  return {
    gauges,
    updated: now.toISOString(),
    source: 'USGS Water Data: latest flow against each gauge\'s own record for this time of year (provisional data)',
  }
}

export const riversRoutes: FastifyPluginAsync = async (app) => {
  app.get('/rivers', {
    schema: {
      tags: ['hunt'],
      summary: 'River gauges: latest flow against normal for this time of year (USGS), for the map',
    },
  }, async (request, reply) => {
    const cached = cache.get('all')
    if (cached && Date.now() - cached.at < CACHE_MS) {
      reply.header('Cache-Control', 'public, max-age=900')
      return cached.data
    }
    try {
      inflight ??= loadRivers().finally(() => { inflight = null })
      const data = await inflight
      cache.set('all', { at: Date.now(), data }, STALE_OK_MS)
      reply.header('Cache-Control', 'public, max-age=900')
      return data
    } catch (err) {
      request.log.warn({ err }, 'rivers: USGS refresh failed')
      if (cached) return cached.data
      return reply.code(503).send({ error: 'River levels are unavailable right now' })
    }
  })
}
