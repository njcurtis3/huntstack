import { describe, expect, it } from 'vitest';

import type { HuntRecommendation } from './api.types';
import { decorateRecommendation } from './recommendations';

/** A recommendation row shaped like GET /api/hunt/recommendations sends it. */
function makeRecommendation(overrides: Partial<HuntRecommendation> = {}): HuntRecommendation {
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
    ...overrides,
  };
}

describe('decorateRecommendation', () => {
  it('expands the state code via @huntstack/shared', () => {
    expect(decorateRecommendation(makeRecommendation()).stateName).toBe('Texas');
  });

  it('falls back to the raw code for a state it does not know', () => {
    expect(decorateRecommendation(makeRecommendation({ state: 'ZZ' })).stateName).toBe('ZZ');
  });

  it('labels a season that spans two years', () => {
    // Also the Intl.DateTimeFormatOptions path inside shared's formatDateRange.
    expect(decorateRecommendation(makeRecommendation()).seasonLabel).toBe('Nov 1, 2026 - Jan 26, 2027');
  });

  it('labels a season inside one month without repeating it', () => {
    const rec = makeRecommendation({ seasonStart: '2026-12-05', seasonEnd: '2026-12-20' });
    expect(decorateRecommendation(rec).seasonLabel).toBe('Dec 5 - 20, 2026');
  });

  it('does not shift a date-only season start into the previous day', () => {
    // Regression guard: new Date('2026-11-01') is UTC midnight, which is Oct 31
    // in every US timezone. The label must read the date the regulation prints.
    const rec = makeRecommendation({ seasonStart: '2026-11-01', seasonEnd: '2026-11-30' });
    expect(decorateRecommendation(rec).seasonLabel).toBe('Nov 1 - 30, 2026');
  });

  it('has no season label when no season is open', () => {
    const rec = makeRecommendation({ seasonOpen: false, seasonStart: null, seasonEnd: null });
    expect(decorateRecommendation(rec).seasonLabel).toBeNull();
  });

  it('measures distance from the hunter with shared calculateDistance', () => {
    // Amarillo, TX to Muleshoe NWR — roughly 110 miles.
    const decorated = decorateRecommendation(makeRecommendation(), { lat: 35.22, lng: -101.83 });
    expect(decorated.distanceMiles).toBeGreaterThan(100);
    expect(decorated.distanceMiles).toBeLessThan(120);
    expect(Number.isInteger((decorated.distanceMiles as number) * 10)).toBe(true);
  });

  it('has no distance when the hunter position is unknown', () => {
    expect(decorateRecommendation(makeRecommendation()).distanceMiles).toBeNull();
  });

  it('has no distance when the location has no center point', () => {
    const rec = makeRecommendation({ centerPoint: null });
    expect(decorateRecommendation(rec, { lat: 35.22, lng: -101.83 }).distanceMiles).toBeNull();
  });

  it('keeps every field the API sent', () => {
    const rec = makeRecommendation();
    const decorated = decorateRecommendation(rec);
    expect(decorated.scoreBreakdown).toEqual(rec.scoreBreakdown);
    expect(decorated.rank).toBe(rec.rank);
    expect(decorated.locationName).toBe(rec.locationName);
  });
});
