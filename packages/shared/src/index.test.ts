import { describe, expect, it } from 'vitest'

import { formatDateRange } from './index'

describe('the test timezone', () => {
  it('is pinned west of UTC', () => {
    // Not a test of this package — a test of the harness. Every assertion below
    // passes against the *buggy* implementation on a UTC host, because that is
    // the one place the off-by-one cannot happen. Fail loudly here rather than
    // report a green suite that proved nothing. See vitest.config.ts.
    expect(new Date('2026-09-01T00:00:00.000Z').getDate()).toBe(31)
    expect(new Date().getTimezoneOffset()).toBeGreaterThan(0)
  })
})

describe('formatDateRange', () => {
  it('reads a bare date-only string as the day the regulation prints', () => {
    expect(formatDateRange('2026-09-01', '2026-09-30')).toBe('Sep 1 - 30, 2026')
  })

  it('reads the ISO-Z form apps/web actually receives as that same day', () => {
    // Drizzle's timestamp mapper builds a UTC-midnight Date, so /api/regulations
    // serializes '2026-09-01T00:00:00.000Z' and never the bare form above. A
    // parser anchored with a trailing `$` matches the first case and misses this
    // one, which is the only case the web app ever hits.
    expect(formatDateRange('2026-09-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z')).toBe('Sep 1 - 30, 2026')
  })

  it('leaves a Date the caller already localized alone', () => {
    // apps/mobile parses to local midnight before calling in. Shifting it here
    // as well would move the day the other way — the same bug, mirrored.
    expect(formatDateRange(new Date(2026, 10, 1), new Date(2026, 10, 30))).toBe('Nov 1 - 30, 2026')
  })

  it('names the month once for a range inside a single month', () => {
    expect(formatDateRange('2026-12-05', '2026-12-20')).toBe('Dec 5 - 20, 2026')
  })

  it('names both months for a range inside a single year', () => {
    expect(formatDateRange('2026-09-01', '2026-10-15')).toBe('Sep 1 - Oct 15, 2026')
  })

  it('spells out both years for a season that crosses into the next one', () => {
    expect(formatDateRange('2026-11-01', '2027-01-26')).toBe('Nov 1, 2026 - Jan 26, 2027')
  })

  it('falls back to Date parsing for a string that is not a leading YYYY-MM-DD', () => {
    // The raw-SQL routes emit '2026-09-01 00:00:00', which V8 lenient-parses as
    // local time — already the right day, and left that way.
    expect(formatDateRange('2026-09-01 00:00:00', '2026-09-30 00:00:00')).toBe('Sep 1 - 30, 2026')
  })
})
