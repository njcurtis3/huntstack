/**
 * Response shapes for the five API endpoints v1 consumes.
 *
 * Hand-written against apps/api's route handlers — the API publishes an OpenAPI
 * document but no generated client, so apps/web keeps its own copy of these same
 * shapes in apps/web/src/lib/api.ts. The two can drift. That is the accepted cost
 * of not extracting a shared API-client package for what is currently one screen.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/** GET /api/species */
export interface Species {
  id: string;
  slug: string;
  name: string;
  scientificName: string | null;
  category: string;
  description: string | null;
  habitat: string | null;
  isMigratory: boolean | null;
  flyways: unknown;
  imageUrl: string | null;
}

/** GET /api/geo/zip/:zip, GET /api/geo/search, GET /api/geo/reverse */
export interface GeoLocation {
  lat: number;
  lng: number;
  city: string;
  state: string;
}

export type CountTrend = 'increasing' | 'decreasing' | 'stable' | 'new' | 'no_data';

export type MigrationStatus =
  | 'arriving'
  | 'building'
  | 'peak'
  | 'declining'
  | 'departing'
  | 'first_survey'
  | 'no_data';

export type WeatherRating = 'excellent' | 'good' | 'fair' | 'poor';

/** One row of GET /api/hunt/recommendations */
export interface HuntRecommendation {
  rank: number;
  score: number;
  locationId: string;
  locationName: string;
  locationType: string;
  state: string;
  flyway: string | null;
  centerPoint: Coordinates | null;
  websiteUrl: string | null;
  species: string;
  speciesName: string;
  latestCount: number | null;
  surveyDate: string | null;
  trend: CountTrend;
  delta: number | null;
  deltaPercent: number | null;
  migrationStatus: MigrationStatus | null;
  isAnomaly: boolean;
  pushScore: number;
  coldFrontPresent: boolean;
  coldFrontIncoming: boolean;
  seasonOpen: boolean;
  seasonName: string | null;
  seasonStart: string | null;
  seasonEnd: string | null;
  bagLimit: unknown;
  weatherRating: WeatherRating | null;
  temperature: number | null;
  temperatureUnit: string | null;
  windSpeed: string | null;
  conditions: string | null;
  scoreBreakdown: {
    trendScore: number;
    magnitudeScore: number;
    seasonScore: number;
    weatherScore: number;
    pushScore: number;
    migrationScore: number;
    anomalyBonus: number;
  };
}

/** GET /api/hunt/recommendations */
export interface HuntRecommendationsResponse {
  recommendations: HuntRecommendation[];
  queryParams: { species: string | null; states: string[]; date: string };
  totalLocations: number;
}
