import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { COVERED_STATES, registryState } from '@huntstack/shared/states'
import { getDb } from '../lib/db.js'
import { BoundedCache } from '../lib/cache.js'
import { PLACES } from '../data/places.js'
import { PUBLIC_LANDS } from '../data/public-lands.js'
import { RIVER_GAUGES } from '../data/river-gauges.js'
import { ZONE_SHAPES } from '../data/zones.js'
import { seasonYearOf } from './hunt.js'

export interface StateCoverage {
  code: string
  name: string
  flyway: string
  /** Season rows for the current season year */
  seasons: number
  seasonYear: number
  licenses: number
  /** Regulation documents Ask AI searches */
  documents: number
  /** Survey sites with any count, and with one in the last 45 days */
  surveySites: number
  surveySitesRecent: number
  /** The statewide agency survey, if HuntStack loads one */
  statewideSurvey: string | null
  ebirdPlaces: number
  towns: number
  publicLands: number
  riverGauges: number
  zoneShapes: number
}

const CACHE_MS = 60 * 60_000
const cache = new BoundedCache<StateCoverage[]>(1)

function countBy<T>(rows: readonly T[], state: (r: T) => string): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) out.set(state(r), (out.get(state(r)) ?? 0) + 1)
  return out
}

/**
 * What HuntStack has for each covered state, counted from the database and the data files (never
 * hand-kept), for the Data Sources page and after scripts/add-state.py.
 */
export async function loadStateCoverage(now = new Date()): Promise<StateCoverage[]> {
  const seasonYear = seasonYearOf(now)
  const rows = await getDb().execute(sql`
    SELECT s.code,
      (SELECT count(*) FROM seasons se WHERE se.state_id = s.id AND se.year = ${seasonYear})::int AS seasons,
      (SELECT count(*) FROM licenses li WHERE li.state_id = s.id)::int AS licenses,
      (SELECT count(*) FROM documents d WHERE d.state_id = s.id)::int AS documents,
      (SELECT count(DISTINCT l.id) FROM locations l JOIN refuge_counts rc ON rc.location_id = l.id
        WHERE l.state_id = s.id AND rc.survey_type NOT LIKE '%annual%')::int AS survey_sites,
      (SELECT count(DISTINCT l.id) FROM locations l JOIN refuge_counts rc ON rc.location_id = l.id
        WHERE l.state_id = s.id AND rc.survey_type NOT LIKE '%annual%'
          AND rc.survey_date >= now() - interval '45 days')::int AS survey_sites_recent,
      (SELECT count(*) FROM locations l WHERE l.state_id = s.id AND l.metadata->>'source' = 'ebird')::int AS ebird_places
    FROM states s
    WHERE s.code IN (${sql.join(COVERED_STATES.map(c => sql`${c}`), sql`, `)})
  `)
  const db = new Map((rows as unknown as Array<Record<string, unknown>>).map(r => [String(r.code), r]))
  const towns = countBy(PLACES, p => p[1])
  const lands = countBy(PUBLIC_LANDS, p => p[3])
  const gauges = countBy(RIVER_GAUGES, g => g[2])
  const zones = countBy(ZONE_SHAPES, z => z[1])
  return COVERED_STATES.map(code => {
    const reg = registryState(code)!
    const r = db.get(code)
    const n = (k: string) => Number(r?.[k] ?? 0)
    return {
      code,
      name: reg.name,
      flyway: reg.flyway,
      seasons: n('seasons'),
      seasonYear,
      licenses: n('licenses'),
      documents: n('documents'),
      surveySites: n('survey_sites'),
      surveySitesRecent: n('survey_sites_recent'),
      statewideSurvey: reg.statewideSurvey?.survey ?? null,
      ebirdPlaces: n('ebird_places'),
      towns: towns.get(code) ?? 0,
      publicLands: lands.get(code) ?? 0,
      riverGauges: gauges.get(code) ?? 0,
      zoneShapes: zones.get(code) ?? 0,
    }
  })
}

export const statesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/coverage', {
    schema: {
      tags: ['states'],
      summary: 'What HuntStack has for each covered state (seasons, licenses, survey sites, eBird places, towns, public land, river gauges, zone shapes)',
    },
  }, async () => {
    const hit = cache.get('coverage')
    if (hit) return { states: hit }
    const states = await loadStateCoverage()
    cache.set('coverage', states, CACHE_MS)
    return { states }
  })
}
