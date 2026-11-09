// ─── eBird results kept in the database ───────────────────────────────────────
// Each successful eBird answer is saved here (scripts/add-ebird-cache-table.sql), so:
//   - a restart reads the saved answers instead of asking eBird for all of them at once (a day
//     of redeploys doing that got the key blocked on 2026-11-09), and
//   - when eBird is refusing us or down, pages show the last numbers we have, up to
//     STALE_LIMIT_MS old, instead of none. eBird answers cover the last 14 days, so a day-old
//     answer is still useful.
// Everything here fails open: without the table or the database, eBird works as before.

import { sql } from 'drizzle-orm'
import { getDb } from './db.js'

export const STALE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000

let tableMissingAt = 0
const RECHECK_MISSING = 60 * 60 * 1000
const unavailable = () => !process.env.DATABASE_URL || Date.now() - tableMissingAt < RECHECK_MISSING

function noteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/ebird_cache.*does not exist|relation .* does not exist/i.test(message)) {
    tableMissingAt = Date.now()
    console.warn('[eBird] ebird_cache table is missing: eBird answers are not kept across restarts')
  } else {
    console.warn(`[eBird] saved-answer query failed: ${message}`)
  }
}

export interface SavedAnswer<T> {
  data: T
  fetchedAt: Date
}

/** The saved answer for a key, if one exists that is younger than maxAgeMs */
export async function loadSaved<T>(key: string, maxAgeMs: number): Promise<SavedAnswer<T> | null> {
  if (unavailable()) return null
  try {
    const rows = await getDb().execute(sql`
      SELECT data, fetched_at FROM ebird_cache
      WHERE key = ${key} AND fetched_at > now() - make_interval(secs => ${maxAgeMs / 1000})
    `)
    const row = (rows as unknown as Array<{ data: unknown; fetched_at: string | Date }>)[0]
    if (!row) return null
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    return { data: data as T, fetchedAt: new Date(row.fetched_at) }
  } catch (error) {
    noteError(error)
    return null
  }
}

/** Save a fresh answer; never waited on by a page and never throws */
export function save(key: string, data: unknown): void {
  if (unavailable()) return
  getDb().execute(sql`
    INSERT INTO ebird_cache (key, data, fetched_at)
    VALUES (${key}, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at
  `).catch(noteError)
}
