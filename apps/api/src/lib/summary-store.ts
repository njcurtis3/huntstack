// ─── Weekly summaries kept in the database ────────────────────────────────────
// Each summary the API writes is saved here (scripts/add-weekly-summaries-table.sql), so:
//   - a restart or a second API instance serves the summary already written instead of paying
//     the model for a new one, and
//   - there is a record of what readers were shown, the facts it came from, and whether the
//     check passed the model's first draft, needed a retry, or fell back to the template.
// Everything here fails open: without the table or the database, summaries live in memory only.

import { sql } from 'drizzle-orm'
import { getDb } from './db.js'

export type SummaryOutcome = 'first_draft' | 'retry' | 'template'

export interface StoredSummary {
  scope: string
  flyway: string | null
  speciesSlug: string | null
  summary: string
  outcome: SummaryOutcome
  problems: string[]
  facts: string | null
  model: string | null
}

let tableMissingAt = 0
const RECHECK_MISSING = 60 * 60 * 1000
const unavailable = () => !process.env.DATABASE_URL || Date.now() - tableMissingAt < RECHECK_MISSING

function noteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/weekly_summaries.*does not exist|relation .* does not exist/i.test(message)) {
    tableMissingAt = Date.now()
    console.warn('[summary] weekly_summaries table is missing: summaries are kept in memory only')
  } else {
    console.warn(`[summary] saved-summary query failed: ${message}`)
  }
}

/** The cache key, and the scope column: one summary per flyway and species choice */
export function summaryScope(flyway?: string, species?: string): string {
  return `summary:${flyway?.toLowerCase() || 'all'}:${species || 'all'}`
}

/** The newest saved summary for a scope, if it is younger than maxAgeMs */
export async function loadLatestSummary(
  scope: string,
  maxAgeMs: number,
): Promise<{ summary: string; generatedAt: Date } | null> {
  if (unavailable()) return null
  try {
    const rows = await getDb().execute(sql`
      SELECT summary, generated_at FROM weekly_summaries
      WHERE scope = ${scope} AND generated_at > now() - make_interval(secs => ${maxAgeMs / 1000})
      ORDER BY generated_at DESC
      LIMIT 1
    `) as unknown as Array<{ summary: string; generated_at: string | Date }>
    const row = rows[0]
    return row ? { summary: row.summary, generatedAt: new Date(row.generated_at) } : null
  } catch (error) {
    noteError(error)
    return null
  }
}

/** Save a summary just written; never waited on by a page and never throws */
export function saveSummary(s: StoredSummary, generatedAt: Date): void {
  if (unavailable()) return
  getDb().execute(sql`
    INSERT INTO weekly_summaries (scope, flyway, species_slug, summary, outcome, problems, facts, model, generated_at)
    VALUES (${s.scope}, ${s.flyway}, ${s.speciesSlug}, ${s.summary}, ${s.outcome},
            ${JSON.stringify(s.problems)}::text::jsonb, ${s.facts}, ${s.model}, ${generatedAt.toISOString()})
  `).catch(noteError)
}
