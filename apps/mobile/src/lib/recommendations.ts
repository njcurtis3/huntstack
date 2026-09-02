/**
 * Presentation fields the API does not send but every recommendation row wants.
 *
 * All three come from @huntstack/shared rather than being re-derived here — the
 * same package apps/api validates with. Notably calculateDistance: apps/web's
 * WhereToHuntPage.tsx hand-rolled its own haversine instead of importing this
 * one, and that is the duplication we are declining to repeat.
 */
import { calculateDistance, formatDateRange, getStateName } from '@huntstack/shared';

import type { Coordinates, HuntRecommendation } from './api.types';

export interface DecoratedRecommendation extends HuntRecommendation {
  /** "Texas" for TX; falls back to the raw code for anything not in US_STATES. */
  stateName: string;
  /** "Nov 1 - Jan 26, 2027", or null when no season is open for this row. */
  seasonLabel: string | null;
  /** Miles from the hunter, or null when either endpoint is unknown. */
  distanceMiles: number | null;
}

/**
 * The API sends season dates as bare 'YYYY-MM-DD'. Handing that string straight
 * to Date parses it as UTC midnight, which is the *previous* day everywhere west
 * of Greenwich — a Nov 1 opener would read "Oct 31" to a hunter in Texas. Season
 * dates carry legal weight, so build the Date in local time instead.
 */
function parseApiDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function decorateRecommendation(
  rec: HuntRecommendation,
  origin?: Coordinates | null,
): DecoratedRecommendation {
  return {
    ...rec,
    stateName: getStateName(rec.state) ?? rec.state,
    seasonLabel:
      rec.seasonStart && rec.seasonEnd
        ? formatDateRange(parseApiDate(rec.seasonStart), parseApiDate(rec.seasonEnd))
        : null,
    distanceMiles:
      origin && rec.centerPoint
        ? Math.round(calculateDistance(origin, rec.centerPoint) * 10) / 10
        : null,
  };
}
