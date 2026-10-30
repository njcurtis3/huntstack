import { describe, expect, it } from 'vitest'
import { buildStateActivity } from './ebird-activity.js'
import { summarizeStateActivity } from '../routes/migration.js'

const report = (state: string, species: string, places: number, birds: number) => ({
  state, species, speciesName: species, places, birds, topPlaces: [],
})

describe('buildStateActivity', () => {
  it('has no trend until a snapshot from about two weeks earlier exists', () => {
    const [row] = buildStateActivity([report('TX', 'mallard', 494, 3000)], new Map(), 'now')
    expect(row.trend).toBe('new')
    expect(row.previousCount).toBeNull()
    expect(row.delta).toBeNull()
    expect(row.currentCount).toBe(3000)
    expect(row.places).toBe(494)
  })

  it('compares with the earlier snapshot', () => {
    const [row] = buildStateActivity(
      [report('KS', 'snow-goose', 9, 400)],
      new Map([['KS:snow-goose', { date: '2026-10-16', places: 4, birds: 100 }]]),
      'now',
    )
    expect(row.previousCount).toBe(100)
    expect(row.previousDate).toBe('2026-10-16')
    expect(row.delta).toBe(300)
    expect(row.deltaPercent).toBe(300)
    expect(row.trend).toBe('increasing')
  })
})

describe('summarizeStateActivity', () => {
  it('totals places and birds per state, most reported species first', () => {
    const [ar] = summarizeStateActivity(buildStateActivity(
      [report('AR', 'mallard', 49, 300), report('AR', 'snow-goose', 5, 84), report('AR', 'gadwall', 30, 200), report('AR', 'pintail', 2, 10)],
      new Map(),
      'now',
    ))
    expect(ar.totalPlaces).toBe(86)
    expect(ar.totalCurrentCount).toBe(594)
    expect(ar.topSpecies.map(s => s.species)).toEqual(['mallard', 'gadwall', 'snow-goose'])
    expect(ar.totalPreviousCount).toBeNull()
    expect(ar.overallDelta).toBeNull()
  })

  it('gives a state change only when every species has an earlier snapshot', () => {
    const rows = [report('OK', 'mallard', 100, 500), report('OK', 'gadwall', 20, 100)]
    const partial = summarizeStateActivity(buildStateActivity(rows, new Map([['OK:mallard', { date: 'd', places: 1, birds: 250 }]]), 'now'))[0]
    expect(partial.overallDelta).toBeNull()
    const full = summarizeStateActivity(buildStateActivity(rows, new Map([
      ['OK:mallard', { date: 'd', places: 1, birds: 250 }],
      ['OK:gadwall', { date: 'd', places: 1, birds: 50 }],
    ]), 'now'))[0]
    expect(full.totalPreviousCount).toBe(300)
    expect(full.overallDelta).toBe(300)
    expect(full.overallDeltaPercent).toBe(100)
  })
})
