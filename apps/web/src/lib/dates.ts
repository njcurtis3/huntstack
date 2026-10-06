/**
 * A survey date is a calendar day, not an instant. apps/api sends refuge count dates as
 * '2026-01-23 00:00:00' (Postgres timestamp text), which Safari will not parse at all and
 * which reads as the previous day west of Greenwich once anything treats it as UTC. Read the
 * leading YYYY-MM-DD and build local midnight from those three numbers instead.
 *
 * Mirrors toCalendarDate in packages/shared, which apps/web does not depend on.
 */
export function parseCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return new Date(value)

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}
