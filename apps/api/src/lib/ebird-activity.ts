// ─── Statewide eBird activity ────────────────────────────────────────────────
// Per state and species: places that reported the species in the last 14 days and the birds
// in each place's latest report. eBird returns only the latest report at each place (see
// ebird.ts), so a change over time can't be asked of it: one snapshot per day goes into
// ebird_activity_snapshots (scripts/add-ebird-activity-snapshots-table.sql) and the trend
// compares today with the snapshot saved about 14 days earlier. Until one exists, rows carry
// no trend.

import { sql } from 'drizzle-orm'
import { getDb } from './db.js'
import {
  ALL_REPORT_SPECIES,
  EBIRD_SPECIES_NAMES,
  STATE_FLYWAY,
  computeActivityLevel,
  computeTrend,
  EBIRD_PAUSE_MS,
  ebirdPaused,
  ebirdRateLimitCount,
  getEBirdSpeciesReports,
  type EBirdSpeciesReport,
} from './ebird.js'

export interface StateSpeciesActivity {
  state: string
  flyway: string | null
  species: string
  speciesName: string
  /** Places with a report in the last 14 days */
  places: number
  /** Birds in each place's latest report, added up */
  currentCount: number
  /** The same figure from the snapshot about 14 days earlier, if one was saved */
  previousCount: number | null
  previousDate: string | null
  delta: number | null
  deltaPercent: number | null
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
  activityLevel: 'high' | 'moderate' | 'low'
  topPlaces: EBirdSpeciesReport['topPlaces']
  fetchedAt: string
}

type Snapshot = { date: string; places: number; birds: number }

const REFRESH_EVERY = 6 * 60 * 60 * 1000  // an hour inside the species cache TTL in ebird.ts (7h)

/** Combine today's reports with earlier snapshots (keyed "TX:mallard") */
export function buildStateActivity(
  reports: EBirdSpeciesReport[],
  previous: Map<string, Snapshot>,
  fetchedAt: string,
): StateSpeciesActivity[] {
  return reports.map(r => {
    const prev = previous.get(`${r.state}:${r.species}`)
    let delta: number | null = null
    let deltaPercent: number | null = null
    let trend: StateSpeciesActivity['trend'] = 'new'
    if (prev) {
      delta = r.birds - prev.birds
      deltaPercent = prev.birds !== 0 ? Math.round((delta / prev.birds) * 1000) / 10 : null
      trend = computeTrend(delta, deltaPercent)
    }
    return {
      state: r.state,
      flyway: STATE_FLYWAY[r.state] ?? null,
      species: r.species,
      speciesName: r.speciesName,
      places: r.places,
      currentCount: r.birds,
      previousCount: prev?.birds ?? null,
      previousDate: prev?.date ?? null,
      delta,
      deltaPercent,
      trend,
      activityLevel: computeActivityLevel(r.birds),
      topPlaces: r.topPlaces,
      fetchedAt,
    }
  })
}

// When the table was last found missing; checked again after an hour, so creating it takes
// effect without restarting the API
let snapshotTableMissingAt = 0
const RECHECK_MISSING_TABLE = 60 * 60 * 1000
const snapshotTableMissing = () => Date.now() - snapshotTableMissingAt < RECHECK_MISSING_TABLE

/** Snapshots 12-16 days old, the one closest to 14 days per state and species */
async function loadPreviousSnapshots(states: string[]): Promise<Map<string, Snapshot>> {
  const out = new Map<string, Snapshot>()
  if (snapshotTableMissing() || states.length === 0) return out
  try {
    const rows = await getDb().execute(sql`
      SELECT DISTINCT ON (state_code, species_slug)
             state_code, species_slug, snapshot_date::text AS snapshot_date, places, birds
      FROM ebird_activity_snapshots
      WHERE state_code IN (${sql.join(states.map(s => sql`${s}`), sql`, `)})
        AND snapshot_date BETWEEN current_date - 16 AND current_date - 12
      ORDER BY state_code, species_slug, abs((current_date - 14) - snapshot_date)
    `)
    for (const r of rows as unknown as Array<{ state_code: string; species_slug: string; snapshot_date: string; places: number; birds: number }>) {
      out.set(`${r.state_code.trim()}:${r.species_slug}`, { date: r.snapshot_date, places: Number(r.places), birds: Number(r.birds) })
    }
  } catch (error) {
    noteSnapshotError(error)
  }
  return out
}

/** Today's figures, once per day (the first refresh of the day wins) */
export async function saveSnapshot(reports: EBirdSpeciesReport[]): Promise<void> {
  if (snapshotTableMissing() || reports.length === 0) return
  try {
    await getDb().execute(sql`
      INSERT INTO ebird_activity_snapshots (state_code, species_slug, snapshot_date, places, birds)
      VALUES ${sql.join(reports.map(r => sql`(${r.state}, ${r.species}, current_date, ${r.places}, ${r.birds})`), sql`, `)}
      ON CONFLICT (state_code, species_slug, snapshot_date) DO NOTHING
    `)
  } catch (error) {
    noteSnapshotError(error)
  }
}

function noteSnapshotError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/ebird_activity_snapshots.*does not exist|relation .* does not exist/i.test(message)) {
    // Run scripts/add-ebird-activity-snapshots-table.sql; until then there's no trend
    snapshotTableMissingAt = Date.now()
    console.warn('[eBird] ebird_activity_snapshots table is missing: no statewide trend until it is created')
  } else {
    console.warn(`[eBird] activity snapshot query failed: ${message}`)
  }
}

/**
 * The newest daily snapshot (up to a week old) per state and species, as reports with no place
 * list. Used only while eBird is refusing us, so the page keeps the last known numbers.
 */
async function loadLatestSnapshots(states: string[]): Promise<EBirdSpeciesReport[]> {
  if (snapshotTableMissing() || states.length === 0) return []
  try {
    const rows = await getDb().execute(sql`
      SELECT DISTINCT ON (state_code, species_slug) state_code, species_slug, places, birds
      FROM ebird_activity_snapshots
      WHERE state_code IN (${sql.join(states.map(s => sql`${s}`), sql`, `)})
        AND snapshot_date >= current_date - 7
      ORDER BY state_code, species_slug, snapshot_date DESC
    `)
    return (rows as unknown as Array<{ state_code: string; species_slug: string; places: number; birds: number }>).map(r => ({
      state: r.state_code.trim(),
      species: r.species_slug,
      speciesName: EBIRD_SPECIES_NAMES[r.species_slug] ?? r.species_slug,
      places: Number(r.places),
      birds: Number(r.birds),
      topPlaces: [],
    }))
  } catch (error) {
    noteSnapshotError(error)
    return []
  }
}

/** Fill in state and species rows missing from a refused fetch with the latest snapshot */
export function withSnapshotFallback(reports: EBirdSpeciesReport[], latest: EBirdSpeciesReport[]): EBirdSpeciesReport[] {
  const have = new Set(reports.map(r => `${r.state}:${r.species}`))
  return [...reports, ...latest.filter(r => !have.has(`${r.state}:${r.species}`))]
}

/**
 * Statewide activity for the given states, optionally narrowed to some species. Always fetches
 * the full species set (cached, refreshed in the background) so every view and the snapshots
 * agree on the numbers.
 */
export async function getStateActivity(states: string[], speciesSlugs?: string[]): Promise<StateSpeciesActivity[]> {
  if (!process.env.EBIRD_API_KEY || states.length === 0) return []
  const refusals = ebirdRateLimitCount()
  const [fetched, previous] = await Promise.all([
    getEBirdSpeciesReports(states, ALL_REPORT_SPECIES),
    loadPreviousSnapshots(states),
  ])
  // eBird refused some of it and nothing was saved for those: show the last daily numbers
  const refused = ebirdRateLimitCount() !== refusals || ebirdPaused()
  const reports = refused ? withSnapshotFallback(fetched, await loadLatestSnapshots(states)) : fetched
  const wanted = speciesSlugs && speciesSlugs.length > 0 ? new Set(speciesSlugs) : null
  return buildStateActivity(wanted ? reports.filter(r => wanted.has(r.species)) : reports, previous, new Date().toISOString())
}

/**
 * Fill the cache and save the day's snapshot now and every 6 hours, so pages don't wait. At
 * startup it reads answers saved before the restart (ebird-store.ts) and asks eBird only for
 * missing or old ones; the 6-hourly runs ask eBird for everything.
 */
export function startStateActivityRefresh(states: string[]): void {
  if (!process.env.EBIRD_API_KEY) return
  const run = async (fresh: boolean) => {
    try {
      const refusals = ebirdRateLimitCount()
      const reports = await getEBirdSpeciesReports(states, ALL_REPORT_SPECIES, 14, { fresh })
      if (ebirdRateLimitCount() !== refusals) {
        // Some states came back empty because eBird refused us: don't save that as the day's
        // snapshot (the first one of the day wins), and refill the cache after the pause
        setTimeout(() => void run(true), EBIRD_PAUSE_MS + 60_000).unref()
        return
      }
      await saveSnapshot(reports)
    } catch (error) {
      console.warn(`[eBird] activity refresh failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  void run(false)
  setInterval(() => void run(true), REFRESH_EVERY).unref()
}
