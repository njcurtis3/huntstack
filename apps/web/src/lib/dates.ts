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

/** The waterfowl season a date falls in, July through June: 2026-01-23 -> "2025-26". */
export function waterfowlSeasonOf(date: Date): string {
  const start = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/**
 * How old a survey is, for counts too old to be in current totals: "Jan 23 survey, 2025-26
 * season" when it's from an earlier season, "Nov 10 survey, 5 weeks old" when it's this season's.
 * A bare date read as current, and "previous season" was wrong for a survey from five weeks ago.
 */
export function oldSurveyLabel(surveyDate: string, now: Date = new Date()): string {
  const d = parseCalendarDate(surveyDate)
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const season = waterfowlSeasonOf(d)
  if (season !== waterfowlSeasonOf(now)) return `${day} survey, ${season} season`
  const weeks = Math.floor((now.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${day} survey, ${weeks} weeks old`
}

/** True when a survey date is from an earlier waterfowl season than now. */
export function isEarlierSeason(surveyDate: string, now: Date = new Date()): boolean {
  return waterfowlSeasonOf(parseCalendarDate(surveyDate)) !== waterfowlSeasonOf(now)
}
