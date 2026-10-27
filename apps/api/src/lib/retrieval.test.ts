import { describe, expect, it } from 'vitest'
import { candidateCount, distinctChunks, sourceKey, textKey } from './retrieval.js'

const row = (content: string, source_url: string | null, similarity: number) => ({ content, source_url, similarity })

describe('distinctChunks', () => {
  it('keeps one copy of text repeated across pages, the best-ranked one', () => {
    const rows = [
      row('Kansas HIP Stamp: $2.50', 'https://ksoutdoors.gov/a', 0.9),
      row('Kansas HIP Stamp: $2.50', 'https://ksoutdoors.gov/b', 0.9),
      row('kansas  HIP stamp: $2.50\n', 'https://ksoutdoors.gov/c', 0.9),
      row('Crane permits obtained in other states are not valid', 'https://ksoutdoors.gov/d', 0.8),
    ]
    const out = distinctChunks(rows, 5)
    expect(out.map(r => r.source_url)).toEqual(['https://ksoutdoors.gov/a', 'https://ksoutdoors.gov/d'])
  })

  it('caps chunks from one page, treating a trailing slash as the same page', () => {
    const rows = [
      row('one', 'https://tpwd.texas.gov/x/', 0.9),
      row('two', 'https://tpwd.texas.gov/x', 0.85),
      row('three', 'https://TPWD.texas.gov/x#top', 0.8),
      row('four', 'https://tpwd.texas.gov/y', 0.7),
    ]
    expect(distinctChunks(rows, 5).map(r => r.content)).toEqual(['one', 'two', 'four'])
    expect(distinctChunks(rows, 5, 1).map(r => r.content)).toEqual(['one', 'four'])
  })

  it('stops at the limit and leaves rows without a URL uncapped', () => {
    const rows = [row('a', null, 0.9), row('b', null, 0.8), row('c', null, 0.7), row('d', null, 0.6)]
    expect(distinctChunks(rows, 3).map(r => r.content)).toEqual(['a', 'b', 'c'])
  })
})

describe('helpers', () => {
  it('normalises text and URLs', () => {
    expect(textKey('  A\n\nB  ')).toBe('a b')
    expect(sourceKey('https://Example.com/Page/#frag')).toBe('https://example.com/page')
    expect(sourceKey(null)).toBeNull()
  })

  it('asks for several candidates per result, within a ceiling', () => {
    expect(candidateCount(5)).toBe(25)
    expect(candidateCount(50)).toBe(100)
  })
})
