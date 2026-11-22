import { describe, expect, it } from 'vitest'
import { flowClass, flowDaysAgo, flowPercentile, flowTrend, halfMonthOf } from './rivers.js'

const p = { p10: 100, p25: 200, p50: 400, p75: 800, p90: 1600 }

describe('halfMonthOf', () => {
  it('splits each month at the 15th', () => {
    expect(halfMonthOf(new Date('2026-01-01T12:00:00Z'))).toBe(0)
    expect(halfMonthOf(new Date('2026-01-15T12:00:00Z'))).toBe(0)
    expect(halfMonthOf(new Date('2026-01-16T12:00:00Z'))).toBe(1)
    expect(halfMonthOf(new Date('2026-11-22T12:00:00Z'))).toBe(21)
    expect(halfMonthOf(new Date('2026-12-31T12:00:00Z'))).toBe(23)
  })
})

describe('flowClass', () => {
  it("uses USGS WaterWatch's bands", () => {
    expect(flowClass(50, p)).toBe('much-below')
    expect(flowClass(150, p)).toBe('below')
    expect(flowClass(200, p)).toBe('normal')
    expect(flowClass(800, p)).toBe('normal')
    expect(flowClass(1000, p)).toBe('above')
    expect(flowClass(2000, p)).toBe('much-above')
  })
  it('never says much above without a published p90', () => {
    expect(flowClass(50_000, { ...p, p90: null })).toBe('above')
  })
})

describe('flowPercentile', () => {
  it('interpolates between percentiles and caps the ends', () => {
    expect(flowPercentile(400, p)).toBe(50)
    expect(flowPercentile(600, p)).toBe(63)
    expect(flowPercentile(10, p)).toBe(5)
    expect(flowPercentile(9999, p)).toBe(95)
    expect(flowPercentile(9999, { ...p, p90: null })).toBe(80)
  })
  it('handles tied percentiles', () => {
    expect(flowPercentile(0, { p10: 0, p25: 0, p50: 3, p75: 8, p90: 20 })).toBe(25)
  })
})

describe('flowTrend', () => {
  it('calls a change past 15% rising or falling', () => {
    expect(flowTrend(1200, 1000)).toEqual({ trend: 'rising', changePercent: 20 })
    expect(flowTrend(800, 1000)).toEqual({ trend: 'falling', changePercent: -20 })
    expect(flowTrend(1100, 1000)).toEqual({ trend: 'steady', changePercent: 10 })
    expect(flowTrend(1100, null)).toEqual({ trend: 'steady', changePercent: null })
    expect(flowTrend(1100, 0)).toEqual({ trend: 'steady', changePercent: null })
  })
})

describe('flowDaysAgo', () => {
  it('takes the nearest day within two of the target', () => {
    const daily = new Map([['2026-11-14', 900], ['2026-11-16', 950]])
    expect(flowDaysAgo(daily, new Date('2026-11-22T15:00:00Z'), 7)).toBe(900) // 11-15 missing, 11-14 is 1 day off
    expect(flowDaysAgo(new Map([['2026-11-01', 1]]), new Date('2026-11-22T15:00:00Z'), 7)).toBeNull()
  })
})
