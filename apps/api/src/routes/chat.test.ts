import { describe, expect, it } from 'vitest'
import { extractEntities, formatBagLimit, formatShootingHours } from './chat.js'

describe('extractEntities', () => {
  it('extracts a state name and species alias', () => {
    const result = extractEntities('snow geese in texas')
    expect(result.stateCodes).toEqual(['TX'])
    expect(result.speciesSlugs).toEqual(['snow-goose'])
    expect(result.isWaterfowl).toBe(true)
  })

  it('does not match a state alias inside another word', () => {
    // "co" (Colorado) must not match inside "cook" or similar; word-boundary
    // regex guards against this false-positive class.
    const result = extractEntities('what should I cook for dinner')
    expect(result.stateCodes).toEqual([])
  })

  it('matches multiple state codes and dedupes', () => {
    const result = extractEntities('regulations for TX and NM and Texas again')
    expect(new Set(result.stateCodes)).toEqual(new Set(['TX', 'NM']))
  })

  it('matches a hyphenated multi-word species alias', () => {
    const result = extractEntities('any info on green-winged teal?')
    expect(result.speciesSlugs).toEqual(['green-winged-teal'])
  })

  it('flags a location query from its keywords', () => {
    const result = extractEntities('where should I hunt this weekend')
    expect(result.isLocationQuery).toBe(true)
  })

  it('flags a weather query from its keywords', () => {
    const result = extractEntities('is there a cold front coming')
    expect(result.isWeatherQuery).toBe(true)
  })

  it('flags a migration query from its keywords', () => {
    const result = extractEntities('what are the latest refuge counts')
    expect(result.isMigrationQuery).toBe(true)
  })

  it('treats a broad waterfowl keyword as waterfowl-relevant even with no specific species', () => {
    const result = extractEntities('any ducks moving around Arkansas')
    expect(result.isWaterfowl).toBe(true)
    expect(result.stateCodes).toEqual(['AR'])
  })

  it('returns empty/false for an unrelated query', () => {
    const result = extractEntities('what time is it')
    expect(result).toEqual({
      stateCodes: [],
      speciesSlugs: [],
      isWaterfowl: false,
      isMigrationQuery: false,
      isLocationQuery: false,
      isWeatherQuery: false,
    })
  })
})

describe('formatBagLimit', () => {
  it('formats daily/possession/season fields', () => {
    const result = formatBagLimit({ daily: 6, possession: 18, season: 'none' })
    expect(result).toBe(', bag limit: daily: 6, possession: 18, season: none')
  })

  it('handles a double-encoded JSON string (Drizzle jsonb quirk)', () => {
    const encoded = JSON.stringify({ daily: 3 })
    expect(formatBagLimit(encoded)).toBe(', bag limit: daily: 3')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatBagLimit(null)).toBe('')
    expect(formatBagLimit(undefined)).toBe('')
  })

  it('renders a null field value as "none"', () => {
    expect(formatBagLimit({ daily: null })).toBe(', bag limit: daily: none')
  })
})

describe('formatShootingHours', () => {
  it('formats a start/end object', () => {
    expect(formatShootingHours({ start: '30 min before sunrise', end: 'sunset' })).toBe(
      '30 min before sunrise to sunset'
    )
  })

  it('passes through a plain string unchanged when decoding fails', () => {
    expect(formatShootingHours('sunrise to sunset')).toBe('sunrise to sunset')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatShootingHours(null)).toBe('')
    expect(formatShootingHours(undefined)).toBe('')
  })
})
