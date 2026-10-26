import { describe, expect, it } from 'vitest'
import { decodeJsonbField, decodePoint } from './jsonb.js'

describe('decodeJsonbField', () => {
  it('returns null for null/undefined', () => {
    expect(decodeJsonbField(null)).toBeNull()
    expect(decodeJsonbField(undefined)).toBeNull()
  })

  it('passes through an already-parsed object unchanged', () => {
    const obj = { daily: 6, possession: 18 }
    expect(decodeJsonbField(obj)).toBe(obj)
  })

  it('parses a double-encoded JSON string', () => {
    // The Python scraper pipeline writes metadata via json.dumps() into a
    // jsonb column, which double-encodes it — the column ends up holding a
    // JSON string instead of a JSON object.
    const encoded = JSON.stringify({ daily: 6, possession: 18 })
    expect(decodeJsonbField(encoded)).toEqual({ daily: 6, possession: 18 })
  })

  it('returns null for an unparseable string instead of throwing', () => {
    expect(decodeJsonbField('not json')).toBeNull()
  })
})

describe('decodePoint', () => {
  it('reads an object point', () => {
    expect(decodePoint({ lat: 35.1, lng: -91.32 })).toEqual({ lat: 35.1, lng: -91.32 })
  })

  it('reads a double-encoded string point', () => {
    expect(decodePoint('{"lat":35.1,"lng":-91.32}')).toEqual({ lat: 35.1, lng: -91.32 })
  })

  it('returns null for missing, malformed, or non-numeric points', () => {
    expect(decodePoint(null)).toBeNull()
    expect(decodePoint('not json')).toBeNull()
    expect(decodePoint({ lat: '35.1', lng: -91.32 })).toBeNull()
    expect(decodePoint({ lat: 35.1 })).toBeNull()
    expect(decodePoint({ lat: NaN, lng: 1 })).toBeNull()
  })
})
