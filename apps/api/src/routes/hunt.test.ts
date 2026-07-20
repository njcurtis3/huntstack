import { describe, expect, it } from 'vitest'
import { getMigrationStatus } from './hunt.js'

describe('getMigrationStatus', () => {
  it('maps a new location (no prior count) to first_survey', () => {
    expect(getMigrationStatus('new', null)).toBe('first_survey')
  })

  it('maps no_data trend to no_data status', () => {
    expect(getMigrationStatus('no_data', null)).toBe('no_data')
  })

  it('maps a strong increase (>20%) to arriving', () => {
    expect(getMigrationStatus('increasing', 25)).toBe('arriving')
  })

  it('maps a mild increase (<=20%) to building', () => {
    expect(getMigrationStatus('increasing', 15)).toBe('building')
  })

  it('treats a null deltaPercent on an increasing trend as building, not arriving', () => {
    expect(getMigrationStatus('increasing', null)).toBe('building')
  })

  it('maps a stable trend to peak', () => {
    expect(getMigrationStatus('stable', 2)).toBe('peak')
  })

  it('maps a strong decrease (<-20%) to departing', () => {
    expect(getMigrationStatus('decreasing', -25)).toBe('departing')
  })

  it('maps a mild decrease (>=-20%) to declining', () => {
    expect(getMigrationStatus('decreasing', -10)).toBe('declining')
  })

  it('treats a null deltaPercent on a decreasing trend as declining, not departing', () => {
    expect(getMigrationStatus('decreasing', null)).toBe('declining')
  })

  it('falls back to no_data for an unrecognized trend', () => {
    expect(getMigrationStatus('bogus', 10)).toBe('no_data')
  })
})
