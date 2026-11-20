// The survey counts behind the Migration page's cards, read once here so the dashboard and the
// weekly summary describe the same numbers. The summary used to run its own query (every row in
// the last 30 days, compared with whatever survey came before it, however long ago), so it called
// Louisiana "building" while the card under it said 51% below the November average.

import { sql } from 'drizzle-orm'
import type { getDb } from './db.js'

type Db = ReturnType<typeof getDb>

/** Fewer earlier surveys of a month than this and its "average" is a couple of years, not a norm */
export const MIN_SURVEYS_IN_AVERAGE = 5

/**
 * The newest count of each species at each survey site, with the survey before it (not yet judged
 * comparable: pass previous_count/previous_date through surveyChange). Statewide MWI rows and
 * survey-only zones are left out, as on the cards.
 */
export async function loadLatestCounts(db: Db, speciesSlug?: string): Promise<Array<Record<string, unknown>>> {
  const rows = await db.execute(sql`
    WITH ranked AS (
      SELECT
        rc.location_id, rc.species_id, rc.count, rc.survey_date, rc.survey_type,
        l.name as refuge_name, s.code as state_code,
        sp.slug as species_slug, sp.name as species_name,
        l.center_point, l.metadata as location_metadata,
        ROW_NUMBER() OVER (
          PARTITION BY rc.location_id, rc.species_id
          ORDER BY rc.survey_date DESC
        ) as rn
      FROM refuge_counts rc
      JOIN locations l ON rc.location_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN species sp ON rc.species_id = sp.id
      WHERE l.name NOT LIKE '%% - Statewide MWI'
        AND (l.metadata->>'survey_only' IS NULL OR l.metadata->>'survey_only' = 'false')
        ${speciesSlug ? sql`AND sp.slug = ${speciesSlug}` : sql``}
    )
    SELECT
      c.location_id, c.refuge_name, c.state_code, c.species_slug, c.species_name,
      c.count, c.survey_date, c.survey_type, c.center_point, c.location_metadata,
      p.count as previous_count, p.survey_date as previous_date
    FROM ranked c
    LEFT JOIN ranked p
      ON c.location_id = p.location_id AND c.species_id = p.species_id AND p.rn = 2
    WHERE c.rn = 1
    ORDER BY c.state_code, c.refuge_name
  `)
  return rows as unknown as Array<Record<string, unknown>>
}

export interface SurveyAverage {
  locationId: string
  surveyDate: string
  total: number
  avgTotal: number
  surveysInAverage: number
  firstYear: number
  lastYear: number
}

/**
 * A monthly statewide survey's newest total against the same month in earlier years (today:
 * LDWF, Sept 2004 on). LDWF's own reports lead with this ("well below the long-term December
 * average"); survey-to-survey change can't say it, since the previous survey is a month back
 * and a different stage of the season. Earlier surveys only: the newest is never in its own
 * average. With a species picked, both sides are that species.
 */
export async function loadSurveyAverages(db: Db, speciesSlug?: string): Promise<SurveyAverage[]> {
  const rows = await db.execute(sql`
    WITH s AS (
      SELECT rc.location_id, rc.survey_date::date AS d, SUM(rc.count)::int AS total
      FROM refuge_counts rc
      JOIN species sp ON sp.id = rc.species_id
      WHERE rc.survey_type = 'aerial_monthly'
        ${speciesSlug ? sql`AND sp.slug = ${speciesSlug}` : sql``}
      GROUP BY 1, 2
    ),
    latest AS (
      SELECT DISTINCT ON (location_id) location_id, d, total FROM s ORDER BY location_id, d DESC
    )
    SELECT latest.location_id, to_char(latest.d, 'YYYY-MM-DD') AS survey_date, latest.total,
           round(avg(h.total))::int AS avg_total, count(*)::int AS surveys,
           min(EXTRACT(YEAR FROM h.d))::int AS first_year, max(EXTRACT(YEAR FROM h.d))::int AS last_year
    FROM latest
    JOIN s h ON h.location_id = latest.location_id
      AND EXTRACT(MONTH FROM h.d) = EXTRACT(MONTH FROM latest.d)
      AND h.d < latest.d
    GROUP BY latest.location_id, latest.d, latest.total
    HAVING count(*) >= ${MIN_SURVEYS_IN_AVERAGE}
  `)
  return (rows as unknown as Array<Record<string, unknown>>).map(r => ({
    locationId: r.location_id as string,
    surveyDate: r.survey_date as string,
    total: r.total as number,
    avgTotal: r.avg_total as number,
    surveysInAverage: r.surveys as number,
    firstYear: r.first_year as number,
    lastYear: r.last_year as number,
  }))
}
