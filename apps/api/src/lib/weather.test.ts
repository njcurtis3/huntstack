import { describe, expect, it } from 'vitest'
import {
  classifyWind,
  computeHuntingRating,
  detectColdFront,
  isNorthWind,
  parseWindSpeed,
  pushFactorAt,
  pushFactorLabel,
  pushRegionFor,
  scorePushForecasts,
  type ForecastPeriod,
  type StatePushFactor,
} from './weather.js'

// Real Texas scoring points from the locations table
const AMARILLO = { lat: 35.15, lng: -101.85 }
const LUBBOCK = { lat: 33.58, lng: -101.87 }
const MULESHOE = { lat: 33.95, lng: -102.77 }
const ANAHUAC = { lat: 29.61, lng: -94.53 }
const CADDO_LAKE = { lat: 32.69, lng: -94.09 }
const LAGUNA_ATASCOSA = { lat: 26.22, lng: -97.35 }

describe('pushRegionFor', () => {
  it('puts Panhandle and South Plains points in TX-HP', () => {
    for (const p of [AMARILLO, LUBBOCK, MULESHOE]) expect(pushRegionFor('TX', p)?.id).toBe('TX-HP')
  })

  it('leaves Gulf Coast, East Texas and Rio Grande Valley points statewide', () => {
    for (const p of [ANAHUAC, CADDO_LAKE, LAGUNA_ATASCOSA]) expect(pushRegionFor('TX', p)).toBeNull()
  })

  it('only matches its own state, and needs a point', () => {
    // Clovis, NM sits inside the same lat/lng box
    expect(pushRegionFor('NM', { lat: 34.4, lng: -103.2 })).toBeNull()
    expect(pushRegionFor('TX', null)).toBeNull()
  })
})

function forecast(opts: { startTemp: number; endTemp: number; wind: string }): ForecastPeriod[] {
  const now = Date.now()
  const hour = 60 * 60 * 1000
  return [0, 12].map((h, i) => ({
    name: `p${i}`,
    startTime: new Date(now + h * hour).toISOString(),
    endTime: new Date(now + (h + 12) * hour).toISOString(),
    isDaytime: i === 0,
    temperature: i === 0 ? opts.startTemp : opts.endTemp,
    temperatureUnit: 'F',
    windSpeed: '15 mph',
    windDirection: opts.wind,
    shortForecast: '',
    detailedForecast: '',
    precipitationChance: null,
    humidity: 0,
    dewpoint: 0,
  }))
}

describe('scorePushForecasts', () => {
  const front = forecast({ startTemp: 30, endTemp: 15, wind: 'N' })   // front now + north wind + sub-freezing
  const calm = forecast({ startTemp: 75, endTemp: 72, wind: 'SSW' })

  it('scores a region on its own points', () => {
    const r = scorePushForecasts([front, front, front])
    expect(r).toMatchObject({ pushScore: 3, coldFrontPresent: true, windIsFromNorth: true, refugesSampled: 3 })
  })

  it('lets a calm majority outvote a front (the statewide-Texas problem)', () => {
    // 6 Panhandle points under a front, 7 Gulf/East points calm
    const r = scorePushForecasts([...Array(6).fill(front), ...Array(7).fill(calm)])
    expect(r.pushScore).toBe(0)
  })

  it('ignores failed forecasts and returns zero when none succeed', () => {
    expect(scorePushForecasts([null, front, []]).refugesSampled).toBe(1)
    expect(scorePushForecasts([null])).toMatchObject({ pushScore: 0, refugesSampled: 0, temperature: null })
  })
})

describe('pushFactorAt', () => {
  const base = { coldFrontPresent: false, coldFrontIncoming: false, windDirection: null, windIsFromNorth: false, temperature: null, temperatureUnit: null, activeAlerts: [], refugesSampled: 1 }
  const tx: StatePushFactor = { ...base, stateCode: 'TX', pushScore: 0 }
  const ok: StatePushFactor = { ...base, stateCode: 'OK', pushScore: 1 }
  const hp: StatePushFactor = { ...base, stateCode: 'TX', regionId: 'TX-HP', regionName: 'Texas Panhandle & South Plains', pushScore: 3 }

  it('uses the region factor inside the region', () => {
    expect(pushFactorAt('TX', AMARILLO, [tx, ok], [hp])?.pushScore).toBe(3)
  })

  it('uses the state factor outside it, or when the region was not scored', () => {
    expect(pushFactorAt('TX', ANAHUAC, [tx, ok], [hp])?.pushScore).toBe(0)
    expect(pushFactorAt('TX', AMARILLO, [tx, ok], [])?.pushScore).toBe(0)
    expect(pushFactorAt('OK', { lat: 36.8, lng: -98.2 }, [tx, ok], [hp])?.pushScore).toBe(1)
  })

  it('labels regional factors so chat and the weekly summary can tell them apart', () => {
    expect(pushFactorLabel(tx)).toBe('TX')
    expect(pushFactorLabel(hp)).toBe('TX (Texas Panhandle & South Plains only)')
  })
})

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
