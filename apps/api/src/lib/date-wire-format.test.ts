import { describe, expect, it } from 'vitest'

// Pinned west of UTC on purpose, and pinned from inside this file rather than
// from vitest.config.ts, because the config is shared with every other api
// suite and this is the only one that cares about the host clock. Node honours
// a TZ reassignment at runtime — V8 drops its cached zone on the next Date —
// so this takes effect for the whole file even on a UTC CI runner. The first
// test below proves it actually took, instead of trusting that it did.
process.env.TZ = 'America/Chicago'

/**
 * This file tests the JavaScript runtime, not any HuntStack module, and that is
 * deliberate. Nothing here imports from src/ and nothing here changes when the
 * routes change — it exists to pin an assumption that apps/api silently depends
 * on and that nothing else in the repo records.
 *
 * THE ASSUMPTION: chat.ts and migration.ts render season and survey dates with
 * `new Date(value).toLocaleDateString(...)`, and they get away with it only
 * because of the *shape* of the string on the wire.
 *
 * They read through raw `db.execute(sql...)`. Drizzle installs a transparent
 * parser for the Postgres date/timestamp OIDs, so postgres.js hands back the
 * raw Postgres text — `'2026-09-01 00:00:00'`, a space separator, no `T` and no
 * `Z`. That is not ISO 8601, so V8 falls back to its lenient parser and treats
 * it as LOCAL midnight. Sep 1 in, Sep 1 out. Correct.
 *
 * The ORM path is not so lucky. `db.select()` (regulations.ts, which is what
 * feeds apps/web) runs the value through drizzle's timestamp mapper, which
 * builds a UTC-midnight Date, and Fastify then serializes
 * `'2026-09-01T00:00:00.000Z'`. That IS ISO, so V8 parses it as UTC, and a
 * reader in Chicago sees Aug 31 — a season opening on the wrong calendar day.
 * That was a real, shipped bug; it is why packages/shared and RegulationsPage
 * both grew a toCalendarDate helper.
 *
 * THE FAILURE THIS PREVENTS: someone migrates chat.ts or migration.ts from raw
 * SQL to the ORM — a perfectly reasonable-looking cleanup, no date code touched
 * — and every season date the LLM quotes silently shifts a day earlier. There
 * is no assertion anywhere else in the repo that would go red. Now there is
 * one: the second test stops describing the current state and starts binding
 * it, so a change to the wire shape has to come here and argue with this file.
 */

describe('the test timezone', () => {
  it('is pinned west of UTC', () => {
    // Not a test of anything HuntStack owns — a test of the harness. On a UTC
    // host the two parse paths below collapse onto the same answer and every
    // assertion in this file passes for the wrong reason. Fail loudly here
    // rather than report a green suite that proved nothing.
    expect(new Date().getTimezoneOffset()).toBeGreaterThan(0)
    expect(new Date('2026-09-01T00:00:00.000Z').getDate()).toBe(31)
  })
})

describe('the raw-SQL wire format', () => {
  it('parses as local midnight, which is why apps/api renders the right day', () => {
    // '2026-09-01 00:00:00' is what chat.ts:694-695, chat.ts:730 and
    // migration.ts:217 actually receive from db.execute. Space-separated, so
    // non-ISO, so lenient-parsed as local. If this ever goes to 31, those three
    // sites start quoting the day before the season opens.
    const raw = new Date('2026-09-01 00:00:00')

    expect(raw.getDate()).toBe(1)
    expect(raw.getMonth()).toBe(8)
    expect(raw.getFullYear()).toBe(2026)
  })

  it('renders the day the regulation prints', () => {
    // The exact call shape chat.ts uses, end to end.
    const rendered = new Date('2026-09-01 00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    expect(rendered).toBe('Sep 1, 2026')
  })
})

describe('the ORM wire format', () => {
  it('parses as UTC, one day early — the bug the other two slices fixed', () => {
    // '2026-09-01T00:00:00.000Z' is what /api/regulations serializes and what
    // apps/web consumes. Recorded here so the contrast with the raw-SQL form
    // above is visible in one place: same instant, same intent, different day.
    const iso = new Date('2026-09-01T00:00:00.000Z')

    expect(iso.getDate()).toBe(31)
    expect(iso.getMonth()).toBe(7)
  })

  it('is the shape a naive renderer gets wrong', () => {
    const rendered = new Date('2026-09-01T00:00:00.000Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    // Asserting the WRONG output on purpose. This is the behaviour that made
    // toCalendarDate necessary in packages/shared and apps/web; if it ever
    // changes, those two helpers deserve a second look rather than a shrug.
    expect(rendered).toBe('Aug 31, 2026')
  })

  it('is also what a bare date-only string does', () => {
    // The seed scripts write '2026-09-01'. Date-only strings are ISO too, so
    // they get the same UTC treatment as the full ISO-Z form — noted because
    // the bare form looks the most innocent of the three and behaves the worst.
    expect(new Date('2026-09-01').getDate()).toBe(31)
  })
})
