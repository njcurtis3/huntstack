import { afterEach, describe, expect, it } from 'vitest'
import { loadLatestSummary, saveSummary, summaryScope } from './summary-store.js'

describe('summaryScope', () => {
  it('is one key per flyway and species choice', () => {
    expect(summaryScope()).toBe('summary:all:all')
    expect(summaryScope('Central')).toBe('summary:central:all')
    expect(summaryScope(undefined, 'mallard')).toBe('summary:all:mallard')
  })
})

describe('without a database', () => {
  const saved = process.env.DATABASE_URL
  afterEach(() => { process.env.DATABASE_URL = saved })

  it('loads nothing and saves nothing, without throwing', async () => {
    delete process.env.DATABASE_URL
    expect(await loadLatestSummary('summary:all:all', 60_000)).toBeNull()
    expect(() => saveSummary({
      scope: 'summary:all:all', flyway: null, speciesSlug: null, summary: 'x',
      outcome: 'first_draft', problems: [], facts: null, model: null,
    }, new Date())).not.toThrow()
  })
})
