/**
 * A survey date or week is a calendar day, not an instant, but apps/api sends it in three
 * shapes: '2026-01-23 00:00:00' from raw SQL, a bare '2026-10-05' (eBird, flyway weeks), and
 * '2026-01-23T00:00:00.000Z' from the ORM. `new Date()` reads the last two as UTC midnight, so
 * every US reader sees the day before — a Monday survey week labelled Sunday — and older Safari
 * rejects the first outright. Read the leading YYYY-MM-DD and build local midnight from those
 * three numbers instead.
 *
 * Mirrors toCalendarDate in packages/shared, which apps/web does not depend on.
 */
export function parseCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return new Date(value)

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}
