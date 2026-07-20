import { describe, expect, it, vi } from 'vitest'
import { BoundedCache } from './cache.js'

describe('BoundedCache', () => {
  it('returns null for a missing key', () => {
    const cache = new BoundedCache<string>()
    expect(cache.get('missing')).toBeNull()
  })

  it('stores and retrieves a value', () => {
    const cache = new BoundedCache<string>()
    cache.set('a', 'value-a', 60_000)
    expect(cache.get('a')).toBe('value-a')
  })

  it('expires entries past their TTL', () => {
    vi.useFakeTimers()
    const cache = new BoundedCache<string>()
    cache.set('a', 'value-a', 1000)
    vi.advanceTimersByTime(1001)
    expect(cache.get('a')).toBeNull()
    vi.useRealTimers()
  })

  it('treats a TTL of 0 as permanent', () => {
    vi.useFakeTimers()
    const cache = new BoundedCache<string>()
    cache.set('a', 'value-a', 0)
    vi.advanceTimersByTime(1_000_000_000)
    expect(cache.get('a')).toBe('value-a')
    vi.useRealTimers()
  })

  it('evicts the oldest entry once at capacity', () => {
    const cache = new BoundedCache<number>(3)
    cache.set('a', 1, 60_000)
    cache.set('b', 2, 60_000)
    cache.set('c', 3, 60_000)
    // Cache is now full; inserting a 4th entry must evict the oldest ('a').
    cache.set('d', 4, 60_000)

    expect(cache.get('a')).toBeNull()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('bumps recency on get, so a recently-read entry survives eviction', () => {
    const cache = new BoundedCache<number>(2)
    cache.set('a', 1, 60_000)
    cache.set('b', 2, 60_000)
    cache.get('a') // 'a' is now more recent than 'b'
    cache.set('c', 3, 60_000) // should evict 'b', not 'a'

    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeNull()
    expect(cache.get('c')).toBe(3)
  })

  it('overwriting an existing key does not count as a new entry', () => {
    const cache = new BoundedCache<number>(2)
    cache.set('a', 1, 60_000)
    cache.set('b', 2, 60_000)
    cache.set('a', 100, 60_000) // update, not insert
    cache.set('c', 3, 60_000) // should evict 'b' (oldest remaining), not force out 'a'

    expect(cache.get('a')).toBe(100)
    expect(cache.get('c')).toBe(3)
  })
})
