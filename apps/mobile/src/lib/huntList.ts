/**
 * Everything the recommendation list decides that is not rendering: sorting,
 * the API's enum-to-English mapping, the empty/error/loading predicate and the
 * score breakdown shaping.
 *
 * It lives apart from the screens for the same reason http.ts lives apart from
 * api.ts — nothing here imports React Native, so vitest exercises it under node.
 * Components themselves are not unit-tested in v1.
 */
import type { CountTrend, HuntRecommendation, MigrationStatus, WeatherRating } from './api.types';
import type { DecoratedRecommendation } from './recommendations';

export type SortMode = 'rank' | 'distance';

/**
 * Stable identity for a row. The API can return the same refuge more than once
 * when no species filter is set — one row per location+species pair — so
 * locationId alone is not unique.
 */
export function recommendationKey(rec: Pick<HuntRecommendation, 'locationId' | 'species'>): string {
  return `${rec.locationId}:${rec.species}`;
}

/**
 * Order the list. Never mutates the input, because it runs inside a render.
 *
 * Distance sort puts rows we cannot measure last rather than dropping or
 * zeroing them: a refuge with no centre point is still a real recommendation,
 * and silently hiding it would be worse than showing it without a distance.
 * Rank breaks every tie, so the API's own ranking is the fallback ordering.
 */
export function sortRecommendations<T extends { rank: number; distanceMiles: number | null }>(
  recommendations: readonly T[],
  mode: SortMode,
): T[] {
  const sorted = [...recommendations];
  if (mode === 'rank') return sorted.sort((a, b) => a.rank - b.rank);

  return sorted.sort((a, b) => {
    if (a.distanceMiles === null && b.distanceMiles === null) return a.rank - b.rank;
    if (a.distanceMiles === null) return 1;
    if (b.distanceMiles === null) return -1;
    if (a.distanceMiles === b.distanceMiles) return a.rank - b.rank;
    return a.distanceMiles - b.distanceMiles;
  });
}

// ─── Label mapping ───────────────────────────────────────────────────────────
// The API speaks in enums. A hunter reading a phone in a truck should not have
// to translate "first_survey" or "no_data" for themselves.

const TREND_LABELS: Record<CountTrend, string> = {
  increasing: 'Rising',
  decreasing: 'Falling',
  stable: 'Steady',
  new: 'First count',
  no_data: 'No counts',
};

const TREND_GLYPHS: Record<CountTrend, string> = {
  increasing: '↑',
  decreasing: '↓',
  stable: '→',
  new: '✦',
  no_data: '–',
};

const MIGRATION_STATUS_LABELS: Record<MigrationStatus, string> = {
  arriving: 'Birds arriving',
  building: 'Numbers building',
  peak: 'Peak numbers',
  declining: 'Numbers declining',
  departing: 'Birds leaving',
  first_survey: 'First survey of the season',
  no_data: 'No survey yet',
};

const WEATHER_RATING_LABELS: Record<WeatherRating, string> = {
  excellent: 'Excellent weather',
  good: 'Good weather',
  fair: 'Fair weather',
  poor: 'Poor weather',
};

export function trendLabel(trend: CountTrend): string {
  return TREND_LABELS[trend] ?? 'Unknown trend';
}

export function trendGlyph(trend: CountTrend): string {
  return TREND_GLYPHS[trend] ?? TREND_GLYPHS.no_data;
}

export function migrationStatusLabel(status: MigrationStatus | null): string {
  return status ? (MIGRATION_STATUS_LABELS[status] ?? 'No survey yet') : 'No survey yet';
}

export function weatherRatingLabel(rating: WeatherRating | null): string {
  return rating ? (WEATHER_RATING_LABELS[rating] ?? 'No forecast') : 'No forecast';
}

/**
 * Season open/closed, with the dates when the API knew them. Season dates carry
 * legal weight, so an open season without dates says so rather than implying
 * they were checked.
 */
export function seasonLabel(rec: Pick<DecoratedRecommendation, 'seasonOpen' | 'seasonLabel'>): string {
  if (!rec.seasonOpen) return 'Season closed';
  return rec.seasonLabel ? `Season open · ${rec.seasonLabel}` : 'Season open';
}

/**
 * Group digits by hand instead of via toLocaleString: Hermes ships a reduced
 * ICU and this string appears on every row.
 */
export function formatCount(count: number | null): string {
  if (count === null) return 'No recent count';
  return `${String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} birds`;
}

/** Tenths are noise past ten miles; nobody plans a drive on 103.4. */
export function formatDistance(miles: number | null): string | null {
  if (miles === null) return null;
  return miles >= 10 ? `${Math.round(miles)} mi` : `${miles} mi`;
}

// ─── List state ──────────────────────────────────────────────────────────────

export interface ListStateInput {
  loading: boolean;
  error: string | null;
  /** null before the first request has ever resolved. */
  response: { recommendations: readonly unknown[] } | null;
  /** What the species picker is currently showing, for the empty message. */
  speciesLabel: string;
}

export type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; title: string; detail: string }
  | { kind: 'empty'; title: string; detail: string }
  | { kind: 'ready' };

/**
 * Which of the four things the list is doing.
 *
 * The empty case is the one worth care. A zero-length response is the NORMAL
 * answer out of season: the ranking is driven by weekly refuge surveys, and
 * before the season's first survey there is genuinely nothing to rank. If the
 * screen just showed an empty list a tester would reasonably read it as broken,
 * so the empty state says out loud that it is a data window and not a failure.
 */
export function describeListState({
  loading,
  error,
  response,
  speciesLabel,
}: ListStateInput): ListState {
  if (error) {
    return {
      kind: 'error',
      title: 'Could not load recommendations',
      detail: error,
    };
  }
  if (loading || response === null) return { kind: 'loading' };
  if (response.recommendations.length === 0) {
    return {
      kind: 'empty',
      title: `Nothing ranked for ${speciesLabel}`,
      detail:
        'This is not an error. Rankings come from weekly refuge surveys, so there is nothing to rank outside the waterfowl season or before this season’s first survey lands. Try All waterfowl, or pull down to refresh once counts start.',
    };
  }
  return { kind: 'ready' };
}

/**
 * Turn anything thrown by the API client into a sentence. React Native's fetch
 * reports every connection failure as the bare string "Network request failed",
 * which tells a hunter on a phone nothing about the two things that are actually
 * wrong most often: the dev API is not running, or the phone left the wifi.
 */
export function humanizeError(err: unknown): string {
  if (err instanceof Error) {
    if (/network request failed/i.test(err.message)) {
      return 'Could not reach the HuntStack API. Check that the phone is on the same wifi as the dev server and that the API is running.';
    }
    return err.message;
  }
  return 'Something went wrong loading recommendations.';
}

// ─── Score breakdown ─────────────────────────────────────────────────────────

export const SCORE_FACTOR_LABELS: Record<keyof HuntRecommendation['scoreBreakdown'], string> = {
  trendScore: 'Count trend',
  magnitudeScore: 'Birds present',
  seasonScore: 'Season open',
  weatherScore: 'Weather',
  pushScore: 'Push factors',
  migrationScore: 'Migration stage',
  anomalyBonus: 'Unusual spike',
};

export interface ScoreFactor {
  key: keyof HuntRecommendation['scoreBreakdown'];
  label: string;
  value: number;
  /** 0-1 of the largest contributing factor, for a bar width. */
  share: number;
}

/**
 * The breakdown as rows, biggest contributor first — the answer to "why is this
 * one first?", which is the whole reason the detail screen exists.
 *
 * Share is relative to the LARGEST factor rather than to a per-factor maximum,
 * because apps/api does not publish those maxima and inventing them here would
 * be drawing a bar against a number nobody agreed to.
 */
export function scoreFactors(breakdown: HuntRecommendation['scoreBreakdown']): ScoreFactor[] {
  const entries = (Object.keys(SCORE_FACTOR_LABELS) as (keyof typeof SCORE_FACTOR_LABELS)[]).map(
    (key) => ({ key, label: SCORE_FACTOR_LABELS[key], value: breakdown[key] ?? 0 }),
  );
  const largest = Math.max(...entries.map((e) => e.value), 0);
  return entries
    .map((entry) => ({ ...entry, share: largest > 0 ? entry.value / largest : 0 }))
    .sort((a, b) => b.value - a.value);
}
