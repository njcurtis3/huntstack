import { describe, expect, it } from 'vitest'
import { EBIRD_SPECIES_CODES } from './ebird.js'

// Taken from eBird's /ref/taxonomy/ebird on 2026-10-27. Codes that aren't real eBird
// species codes never match an observation, so a typo silently drops a species.
const VALID_EBIRD_CODES = new Set([
  'mallar3', 'norpin', 'snogoo', 'cangoo', 'gwfgoo', 'rosgoo', 'gadwal', 'norsho', 'amewig',
  'gnwtea', 'buwtea', 'canvas', 'redhea', 'lessca', 'gresca', 'buffle', 'rudduc', 'rinduc',
  'motduc', 'cacgoo1', 'y00470', 'sxrgoo1', 'y00469', 'scaup', 'y00314', 'teal',
])

describe('EBIRD_SPECIES', () => {
  it('uses only real eBird species codes', () => {
    expect(EBIRD_SPECIES_CODES.filter(c => !VALID_EBIRD_CODES.has(c))).toEqual([])
  })
})
