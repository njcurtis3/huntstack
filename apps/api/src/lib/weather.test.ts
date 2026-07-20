import { describe, expect, it } from 'vitest'
import {
  classifyWind,
  computeHuntingRating,
  detectColdFront,
  isNorthWind,
  parseWindSpeed,
} from './weather.js'

describe('isNorthWind', () => {
  it('matches north-quadrant directions case-insensitively', () => {
    expect(isNorthWind('N')).toBe(true)
    expect(isNorthWind('nw')).toBe(true)
    expect(isNorthWind(' NNE ')).toBe(true)
  })

  it('rejects non-north directions', () => {
    expect(isNorthWind('S')).toBe(false)
    expect(isNorthWind('SW')).toBe(false)
    expect(isNorthWind('E')).toBe(false)
  })
})

describe('parseWindSpeed', () => {
  it('parses a single value', () => {
    expect(parseWindSpeed('10 mph')).toBe(10)
  })

  it('takes the higher value of a range (conservative)', () => {
    expect(parseWindSpeed('10 to 20 mph')).toBe(20)
  })

  it('returns 0 when unparseable', () => {
    expect(parseWindSpeed('calm')).toBe(0)
  })
})

describe('classifyWind', () => {
  it.each([
    [0, 'calm'],
    [5, 'calm'],
    [6, 'light'],
    [10, 'light'],
    [11, 'moderate'],
    [20, 'moderate'],
    [21, 'strong'],
    [30, 'strong'],
    [31, 'dangerous'],
  ] as const)('%i mph -> %s', (mph, expected) => {
    expect(classifyWind(mph)).toBe(expected)
  })
})

describe('computeHuntingRating', () => {
  it('rates dangerous wind as poor regardless of other factors', () => {
    expect(computeHuntingRating(35, 0, 30)).toBe('poor')
  })

  it('rates very high precipitation as poor', () => {
    expect(computeHuntingRating(10, 85, 30)).toBe('poor')
  })

  it('rates ideal waterfowl conditions as excellent', () => {
    expect(computeHuntingRating(15, 10, 35)).toBe('excellent')
  })

  it('rates moderate conditions as good', () => {
    expect(computeHuntingRating(8, 40, 55)).toBe('good')
  })

  it('falls back to fair outside the good/excellent bands', () => {
    expect(computeHuntingRating(3, 0, 70)).toBe('fair')
  })

  it('treats a null precipitation value as 0', () => {
    expect(computeHuntingRating(15, null, 35)).toBe('excellent')
  })
})

describe('detectColdFront', () => {
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString()

  it('returns no signal with fewer than 2 periods', () => {
    expect(detectColdFront([])).toEqual({ coldFrontPresent: false, coldFrontIncoming: false })
    expect(detectColdFront([{ temperature: 50, startTime: hoursFromNow(0) }])).toEqual({
      coldFrontPresent: false,
      coldFrontIncoming: false,
    })
  })

  it('detects a present front: >=10F drop within the next 24h, max before min', () => {
    const periods = [
      { temperature: 60, startTime: hoursFromNow(1) },
      { temperature: 48, startTime: hoursFromNow(12) },
    ]
    expect(detectColdFront(periods)).toEqual({ coldFrontPresent: true, coldFrontIncoming: false })
  })

  it('does not flag a present front for a drop under 10F', () => {
    const periods = [
      { temperature: 60, startTime: hoursFromNow(1) },
      { temperature: 55, startTime: hoursFromNow(12) },
    ]
    expect(detectColdFront(periods).coldFrontPresent).toBe(false)
  })

  it('does not flag a present front when temp is recovering (min precedes max)', () => {
    const periods = [
      { temperature: 40, startTime: hoursFromNow(1) },
      { temperature: 55, startTime: hoursFromNow(12) },
    ]
    expect(detectColdFront(periods).coldFrontPresent).toBe(false)
  })

  it('detects an incoming front: drop visible in 24-48h window, not yet present', () => {
    const periods = [
      { temperature: 55, startTime: hoursFromNow(1) },
      { temperature: 53, startTime: hoursFromNow(10) },
      { temperature: 65, startTime: hoursFromNow(30) },
      { temperature: 50, startTime: hoursFromNow(40) },
    ]
    const result = detectColdFront(periods)
    expect(result.coldFrontPresent).toBe(false)
    expect(result.coldFrontIncoming).toBe(true)
  })

  it('orders max/min by actual startTime, not by array position', () => {
    // Regression: this previously compared array *index* position within
    // the windowed subset instead of real startTime values, so it silently
    // assumed the caller passed periods in chronological order. Here the
    // array order is reversed relative to the timestamps — the min is
    // listed first but its timestamp is later, and the max is listed
    // second but its timestamp is earlier — so this must still register as
    // a genuine present front (max time precedes min time), regardless of
    // array order.
    const periods = [
      { temperature: 45, startTime: hoursFromNow(12) }, // min, but listed first
      { temperature: 60, startTime: hoursFromNow(1) },  // max, but listed second
    ]
    expect(detectColdFront(periods)).toEqual({ coldFrontPresent: true, coldFrontIncoming: false })
  })
})
