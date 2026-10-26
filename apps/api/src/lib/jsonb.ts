// Drizzle/Postgres JSONB columns normally arrive already parsed as objects.
// The Python scraper pipeline (pipelines.py) writes documents.metadata and
// refuge_counts.metadata via json.dumps() into a jsonb column, which
// double-encodes them — the column ends up holding a JSON string instead of
// a JSON object, so callers get back a string that needs a second parse.
// Seasons/regulations metadata isn't written by that path today, but if it
// ever is, this keeps every route decoding it the same way instead of each
// one growing its own ad-hoc `typeof === 'string'` check.
export function decodeJsonbField<T = Record<string, unknown>>(value: unknown): T | null {
  if (value == null) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  return value as T
}

// locations.center_point has been stored both as an object and as a double-encoded JSON string.
// Reading .lat off the string yields undefined, which made every forecast fetch for that state
// fail and silently dropped the state from push scoring. Returns null unless both coordinates are
// finite numbers, so a malformed row is skipped rather than sent to NOAA.
export function decodePoint(value: unknown): { lat: number; lng: number } | null {
  const point = decodeJsonbField<{ lat?: unknown; lng?: unknown }>(value)
  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return null
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null
  return { lat: point.lat, lng: point.lng }
}
