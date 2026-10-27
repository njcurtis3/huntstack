// Vector search over document_chunks, and picking results worth showing.
//
// Agency sites repeat the same text on many pages (KDWP puts its stamp prices and HIP notes on
// ~50 pages), so the nearest chunks are often one passage several times over. Callers fetch more
// candidates than they need (CANDIDATE_FACTOR) and keep the best of each distinct text, at most
// MAX_PER_SOURCE chunks from any one page, so a few results cover several sources.

import { sql, type SQL } from 'drizzle-orm'
import type { getDb } from './db.js'

export const CANDIDATE_FACTOR = 5
export const MAX_CANDIDATES = 100
export const MAX_PER_SOURCE = 2

export interface RetrievedChunk {
  content: string
  source_url: string | null
  similarity: number
}

/** Same text, ignoring case and whitespace. */
export function textKey(content: string): string {
  return content.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Same page, ignoring case, a trailing slash and a #fragment. */
export function sourceKey(url: string | null): string | null {
  if (!url) return null
  return url.toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '')
}

/** How many rows to ask the database for, to end up with `limit` distinct ones. */
export function candidateCount(limit: number): number {
  return Math.min(limit * CANDIDATE_FACTOR, MAX_CANDIDATES)
}

/**
 * Keep rows in order (best first), dropping repeated text and anything past
 * `maxPerSource` from one page, until `limit` are kept.
 */
export function distinctChunks<T extends RetrievedChunk>(rows: T[], limit: number, maxPerSource = MAX_PER_SOURCE): T[] {
  const seenText = new Set<string>()
  const perSource = new Map<string, number>()
  const kept: T[] = []
  for (const row of rows) {
    if (kept.length >= limit) break
    const text = textKey(row.content)
    if (seenText.has(text)) continue
    const source = sourceKey(row.source_url)
    if (source !== null && (perSource.get(source) ?? 0) >= maxPerSource) continue
    seenText.add(text)
    if (source !== null) perSource.set(source, (perSource.get(source) ?? 0) + 1)
    kept.push(row)
  }
  return kept
}

// Survey and area reports: AGFC aerial survey reports, KDWP area waterfowl reports, hunter
// surveys and banding reports, ODWC waterfowl and wetland status reports. Matched on title +
// URL (Postgres regex, case-insensitive). Useful for "how many ducks" or "where are they", but
// on a rules question they outrank the rules: their text is full of species and state names.
// Checked against every document on 2026-10-27: 88 matched, all reports, no rules pages.
export const REPORT_PATTERN =
  '(survey[ +_-]*report|hunter[ +_-]*survey|waterfowl[ +_-]*reports?|wetland[ +_-]*status[ +_-]*report|banding[ +_-]*report|season[ +_-]*report)'

export interface ChunkFilters {
  /** Only documents from these states (every document has a state). Empty: all states. */
  stateCodes?: string[]
  /** Leave out survey and area reports (REPORT_PATTERN). */
  skipReports?: boolean
}

/** WHERE conditions for a chunk search (`dc` = document_chunks, `d` = documents). */
export function chunkConditions(filters: ChunkFilters): SQL {
  const conditions: SQL[] = [sql`dc.embedding IS NOT NULL`]
  if (filters.stateCodes && filters.stateCodes.length > 0) {
    conditions.push(sql`d.state_id IN (SELECT id FROM states WHERE code IN (${sql.join(filters.stateCodes.map(c => sql`${c}`), sql`, `)}))`)
  }
  if (filters.skipReports) {
    conditions.push(sql`(coalesce(d.title, '') || ' ' || coalesce(d.source_url, '')) !~* ${REPORT_PATTERN}`)
  }
  return sql.join(conditions, sql` AND `)
}

export interface ChunkRow {
  id: string
  content: string
  chunk_metadata: Record<string, unknown> | null
  title: string
  source_url: string | null
  document_type: string
  doc_metadata: Record<string, unknown> | null
  similarity: number
}

/**
 * The `limit` best distinct chunks for an embedded query, at least `minSimilarity` alike.
 *
 * The ivfflat index looks in one list by default and filters afterwards, so a state filter
 * could leave a handful of rows or none. `ivfflat.iterative_scan` (pgvector 0.8) keeps
 * scanning lists until enough rows pass the filter; `relaxed_order` can return them slightly
 * out of order, so they are re-sorted here. SET LOCAL needs the transaction.
 */
export async function searchChunks(
  db: ReturnType<typeof getDb>,
  embedding: number[],
  limit: number,
  filters: ChunkFilters = {},
  minSimilarity = 0.3,
): Promise<ChunkRow[]> {
  const vector = JSON.stringify(embedding)
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ivfflat.iterative_scan = relaxed_order`)
    return tx.execute(sql`
      SELECT dc.id, dc.content, dc.metadata AS chunk_metadata, d.title, d.source_url, d.document_type,
             d.metadata AS doc_metadata, 1 - (dc.embedding <=> ${vector}::vector) AS similarity
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE ${chunkConditions(filters)}
      ORDER BY dc.embedding <=> ${vector}::vector
      LIMIT ${candidateCount(limit)}
    `)
  })
  const candidates = (rows as unknown as ChunkRow[])
    .map(r => ({ ...r, similarity: Number(r.similarity) }))
    .filter(r => r.similarity > minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
  return distinctChunks(candidates, limit)
}
