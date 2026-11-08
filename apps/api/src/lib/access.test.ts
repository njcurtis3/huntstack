import { describe, expect, it } from 'vitest'
import { accessLabel, accessOf, isHuntable } from './access.js'

describe('accessOf', () => {
  it('reads access, note and source from metadata', () => {
    expect(accessOf({ access: 'limited', accessNote: 'Light geese only', accessSource: 'https://fws.gov/x' }))
      .toEqual({ access: 'limited', note: 'Light geese only', source: 'https://fws.gov/x' })
  })

  it('reads double-encoded metadata', () => {
    expect(accessOf(JSON.stringify({ access: 'private' })).access).toBe('private')
  })

  it('treats missing or unrecognized values as unknown', () => {
    expect(accessOf(null).access).toBe('unknown')
    expect(accessOf({ access: 'maybe' }).access).toBe('unknown')
  })
})

describe('isHuntable', () => {
  it('drops only private and closed places', () => {
    expect(isHuntable('public')).toBe(true)
    expect(isHuntable('limited')).toBe(true)
    expect(isHuntable('unknown')).toBe(true)
    expect(isHuntable('closed')).toBe(false)
    expect(isHuntable('private')).toBe(false)
  })
})

describe('accessLabel', () => {
  it('never calls an unchecked place public', () => {
    expect(accessLabel({ access: 'unknown', note: null, source: null })).toMatch(/not verified/)
  })

  it('adds the note', () => {
    expect(accessLabel({ access: 'closed', note: 'Dove hunting only', source: null }))
      .toBe('closed to waterfowl hunting (Dove hunting only)')
  })
})
