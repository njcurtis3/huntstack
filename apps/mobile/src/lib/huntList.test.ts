import { describe, expect, it } from 'vitest';

import type { HuntRecommendation } from './api.types';
import {
  describeListState,
  formatCount,
  formatDistance,
  humanizeError,
  migrationStatusLabel,
  recommendationKey,
  scoreFactors,
  seasonLabel,
  sortRecommendations,
  trendGlyph,
  trendLabel,
  weatherRatingLabel,
} from './huntList';
import type { DecoratedRecommendation } from './recommendations';

/** Only the fields the sort reads — the sort is generic over exactly those. */
function row(rank: number, distanceMiles: number | null) {
  return { rank, distanceMiles };
}

function decorated(overrides: Partial<DecoratedRecommendation> = {}): DecoratedRecommendation {
  return {
    rank: 1,
    score: 78,
    locationId: 'loc-1',
    locationName: 'Muleshoe National Wildlife Refuge',
    locationType: 'wildlife_refuge',
    state: 'TX',
    flyway: 'central',
    centerPoint: { lat: 33.95, lng: -102.77 },
    websiteUrl: null,
    species: 'snow-goose',
    speciesName: 'Snow Goose',
    latestCount: 12000,
    surveyDate: '2026-12-08',
    trend: 'increasing',
    delta: 4000,
    deltaPercent: 50,
    migrationStatus: 'arriving',
    isAnomaly: true,
    pushScore: 2,
    coldFrontPresent: true,
    coldFrontIncoming: false,
    seasonOpen: true,
    seasonName: 'Light Goose Conservation Order',
    seasonStart: '2026-11-01',
    seasonEnd: '2027-01-26',
    bagLimit: null,
    weatherRating: 'good',
    temperature: 41,
    temperatureUnit: 'F',
    windSpeed: '15 mph',
    conditions: 'Partly Cloudy',
    scoreBreakdown: {
      trendScore: 25,
      magnitudeScore: 18,
      seasonScore: 20,
      weatherScore: 10,
      pushScore: 7,
      migrationScore: 10,
      anomalyBonus: 5,
    },
    stateName: 'Texas',
    seasonLabel: 'Nov 1, 2026 - Jan 26, 2027',
    distanceMiles: 110.4,
    ...overrides,
  };
}

describe('recommendationKey', () => {
  it('combines location and species, because a location repeats across species', () => {
    expect(recommendationKey({ locationId: 'loc-1', species: 'snow-goose' })).toBe(
      'loc-1:snow-goose',
    );
    expect(recommendationKey({ locationId: 'loc-1', species: 'mallard' })).not.toBe(
      recommendationKey({ locationId: 'loc-1', species: 'snow-goose' }),
    );
  });
});

describe('sortRecommendations', () => {
  it('orders by rank in rank mode', () => {
    const sorted = sortRecommendations([row(3, 1), row(1, 90), row(2, 40)], 'rank');
    expect(sorted.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('orders by distance in distance mode', () => {
    const sorted = sortRecommendations([row(1, 90), row(2, 12), row(3, 40)], 'distance');
    expect(sorted.map((r) => r.distanceMiles)).toEqual([12, 40, 90]);
  });

  it('puts unmeasurable rows last rather than dropping or zeroing them', () => {
    const sorted = sortRecommendations([row(1, null), row(2, 40), row(3, null)], 'distance');
    expect(sorted.map((r) => r.rank)).toEqual([2, 1, 3]);
  });

  it('breaks a distance tie on rank', () => {
    const sorted = sortRecommendations([row(4, 25), row(2, 25)], 'distance');
    expect(sorted.map((r) => r.rank)).toEqual([2, 4]);
  });

  it('keeps rank order among rows that all lack a distance', () => {
    const sorted = sortRecommendations([row(3, null), row(1, null)], 'distance');
    expect(sorted.map((r) => r.rank)).toEqual([1, 3]);
  });

  it('does not mutate its input, since it runs inside a render', () => {
    const input = [row(3, 1), row(1, 90)];
    sortRecommendations(input, 'rank');
    expect(input.map((r) => r.rank)).toEqual([3, 1]);
  });
});

describe('label mapping', () => {
  it('maps every trend the API can send', () => {
    expect(trendLabel('increasing')).toBe('Rising');
    expect(trendLabel('decreasing')).toBe('Falling');
    expect(trendLabel('stable')).toBe('Steady');
    expect(trendLabel('new')).toBe('First count');
    expect(trendLabel('no_data')).toBe('No counts');
  });

  it('gives every trend a glyph', () => {
    const trends = ['increasing', 'decreasing', 'stable', 'new', 'no_data'] as const;
    expect(new Set(trends.map(trendGlyph)).size).toBe(trends.length);
  });

  it('maps every migration status the API can send', () => {
    expect(migrationStatusLabel('arriving')).toBe('Birds arriving');
    expect(migrationStatusLabel('building')).toBe('Numbers building');
    expect(migrationStatusLabel('peak')).toBe('Peak numbers');
    expect(migrationStatusLabel('declining')).toBe('Numbers declining');
    expect(migrationStatusLabel('departing')).toBe('Birds leaving');
    expect(migrationStatusLabel('first_survey')).toBe('First survey of the season');
    expect(migrationStatusLabel('no_data')).toBe('No survey yet');
  });

  it('treats a null migration status as no survey rather than blank', () => {
    expect(migrationStatusLabel(null)).toBe('No survey yet');
  });

  it('maps every weather rating, and says so when there is no forecast', () => {
    expect(weatherRatingLabel('excellent')).toBe('Excellent weather');
    expect(weatherRatingLabel('good')).toBe('Good weather');
    expect(weatherRatingLabel('fair')).toBe('Fair weather');
    expect(weatherRatingLabel('poor')).toBe('Poor weather');
    expect(weatherRatingLabel(null)).toBe('No forecast');
  });

  it('never invents a value the API did not send, even for an unknown enum', () => {
    // The API is versioned separately; a new enum member must not render "undefined".
    expect(trendLabel('sideways' as never)).toBe('Unknown trend');
    expect(migrationStatusLabel('staging' as never)).toBe('No survey yet');
    expect(weatherRatingLabel('mixed' as never)).toBe('No forecast');
  });

  it('shows season dates when the API knew them', () => {
    expect(seasonLabel({ seasonOpen: true, seasonLabel: 'Nov 1 - 30, 2026' })).toBe(
      'Season open · Nov 1 - 30, 2026',
    );
  });

  it('does not imply dates were checked when there are none', () => {
    expect(seasonLabel({ seasonOpen: true, seasonLabel: null })).toBe('Season open');
    expect(seasonLabel({ seasonOpen: false, seasonLabel: null })).toBe('Season closed');
  });

  it('groups count digits without Intl, which Hermes ships only partly', () => {
    expect(formatCount(12000)).toBe('12,000 birds');
    expect(formatCount(1234567)).toBe('1,234,567 birds');
    expect(formatCount(842)).toBe('842 birds');
    expect(formatCount(null)).toBe('No recent count');
  });

  it('drops distance tenths past ten miles', () => {
    expect(formatDistance(4.2)).toBe('4.2 mi');
    expect(formatDistance(110.4)).toBe('110 mi');
    expect(formatDistance(null)).toBeNull();
  });
});

describe('describeListState', () => {
  const base = { loading: false, error: null, speciesLabel: 'Snow Goose' };

  it('is loading before the first response lands', () => {
    expect(describeListState({ ...base, response: null }).kind).toBe('loading');
  });

  it('is loading while a request is in flight', () => {
    const state = describeListState({
      ...base,
      loading: true,
      response: { recommendations: [] },
    });
    expect(state.kind).toBe('loading');
  });

  it('reports an error ahead of anything else', () => {
    const state = describeListState({ ...base, loading: true, error: 'Boom', response: null });
    expect(state).toMatchObject({ kind: 'error', detail: 'Boom' });
  });

  it('says an empty list is a data window and not a failure', () => {
    // The point of the test: out of season the API legitimately ranks nothing,
    // and a bare empty list would read as a broken screen.
    const state = describeListState({
      ...base,
      response: { recommendations: [] },
    });
    expect(state.kind).toBe('empty');
    if (state.kind !== 'empty') throw new Error('unreachable');
    expect(state.title).toContain('Snow Goose');
    expect(state.detail).toMatch(/not an error/i);
    expect(state.detail).toMatch(/survey/i);
  });

  it('is ready once there is something to show', () => {
    const state = describeListState({
      ...base,
      response: { recommendations: [decorated()] },
    });
    expect(state.kind).toBe('ready');
  });
});

describe('humanizeError', () => {
  it('translates React Native fetch failure into something actionable', () => {
    const message = humanizeError(new Error('Network request failed'));
    expect(message).toMatch(/same wifi/i);
    expect(message).not.toMatch(/Network request failed/);
  });

  it('passes through the API"s own message, which is already human', () => {
    expect(humanizeError(new Error('Invalid zip code'))).toBe('Invalid zip code');
  });

  it('does not render a thrown non-Error as [object Object]', () => {
    expect(humanizeError({ nope: true })).toBe('Something went wrong loading recommendations.');
  });
});

describe('scoreFactors', () => {
  const breakdown: HuntRecommendation['scoreBreakdown'] = {
    trendScore: 25,
    magnitudeScore: 18,
    seasonScore: 20,
    weatherScore: 10,
    pushScore: 7,
    migrationScore: 10,
    anomalyBonus: 5,
  };

  it('answers "why is this first" biggest contributor first', () => {
    const factors = scoreFactors(breakdown);
    expect(factors[0]).toMatchObject({ key: 'trendScore', label: 'Count trend', value: 25 });
    expect(factors.map((f) => f.value)).toEqual([25, 20, 18, 10, 10, 7, 5]);
  });

  it('keeps every factor, including the ones that scored nothing', () => {
    const factors = scoreFactors({ ...breakdown, anomalyBonus: 0 });
    expect(factors).toHaveLength(7);
    expect(factors.at(-1)).toMatchObject({ key: 'anomalyBonus', value: 0, share: 0 });
  });

  it('shares are relative to the largest factor', () => {
    const factors = scoreFactors(breakdown);
    expect(factors[0].share).toBe(1);
    expect(factors.find((f) => f.key === 'seasonScore')?.share).toBeCloseTo(20 / 25);
  });

  it('does not divide by zero when nothing scored', () => {
    const factors = scoreFactors({
      trendScore: 0,
      magnitudeScore: 0,
      seasonScore: 0,
      weatherScore: 0,
      pushScore: 0,
      migrationScore: 0,
      anomalyBonus: 0,
    });
    expect(factors.every((f) => f.share === 0)).toBe(true);
  });
});
