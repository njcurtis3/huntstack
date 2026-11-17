import { describe, expect, it } from 'vitest'
import { COMPARABLE_DAYS, surveyChange } from './survey-change.js'

describe('surveyChange', () => {
  it('compares weekly surveys', () => {
    expect(surveyChange(1500, '2026-11-10', 1000, '2026-11-03')).toEqual({
      previousCount: 1000, previousDate: '2026-11-03', delta: 500, deltaPercent: 50, trend: 'increasing',
    })
  })

  it('calls a change under 5% stable', () => {
    expect(surveyChange(1030, '2026-11-10', 1000, '2026-11-03').trend).toBe('stable')
  })

  it('does not compare a monthly survey with one two months earlier', () => {
    // LDWF Nov 2026 blue-winged teal against September's teal-only flight
    expect(surveyChange(259000, '2026-11-12', 73000, '2026-09-15')).toEqual({
      previousCount: null, previousDate: null, delta: null, deltaPercent: null, trend: 'new',
    })
  })

  it('does not compare across seasons', () => {
    expect(surveyChange(13000, '2026-11-12', 802000, '2026-01-23').trend).toBe('new')
  })

  it('compares up to the limit and not past it', () => {
    expect(surveyChange(2, '2026-11-22', 1, '2026-11-01').trend).toBe('increasing') // 21 days
    expect(COMPARABLE_DAYS).toBe(21)
    expect(surveyChange(2, '2026-11-23', 1, '2026-11-01').trend).toBe('new') // 22 days
  })

  it('accepts Date objects and timestamps', () => {
    const r = surveyChange(800, new Date('2026-11-10T00:00:00Z'), 1000, '2026-11-03 00:00:00')
    expect(r.deltaPercent).toBe(-20)
    expect(r.previousDate).toBe('2026-11-03')
  })

  it('is new with no previous count or no previous date', () => {
    expect(surveyChange(10, '2026-11-10', null, null).trend).toBe('new')
    expect(surveyChange(10, '2026-11-10', 5, null).trend).toBe('new')
  })

  it('leaves the percent empty when the previous count was zero', () => {
    expect(surveyChange(10, '2026-11-10', 0, '2026-11-03')).toMatchObject({ delta: 10, deltaPercent: null, trend: 'increasing' })
  })
})
