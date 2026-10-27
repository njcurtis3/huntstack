// Picking vector-search results worth showing.
//
// Agency sites repeat the same text on many pages (KDWP puts its stamp prices and HIP notes on
// ~50 pages), so the nearest chunks are often one passage several times over. Callers fetch more
// candidates than they need (CANDIDATE_FACTOR) and keep the best of each distinct text, at most
// MAX_PER_SOURCE chunks from any one page, so a few results cover several sources.

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
