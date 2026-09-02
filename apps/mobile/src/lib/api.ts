/**
 * The HuntStack mobile API client.
 *
 * Covers only the five endpoints the "Where should I hunt this weekend?" screen
 * needs. apps/web's client is not reusable here — its first line reads
 * import.meta.env.VITE_API_URL, which does not exist in React Native — so this is
 * a fresh client rather than a copy, and it stays small on purpose.
 */
import Constants from 'expo-constants';

import type {
  Coordinates,
  GeoLocation,
  HuntRecommendation,
  HuntRecommendationsResponse,
  Species,
} from './api.types';
import { buildUrl, getJson, resolveApiBaseUrl, type RequestOptions } from './http';
import { decorateRecommendation, type DecoratedRecommendation } from './recommendations';

let cachedBaseUrl: string | null = null;

/**
 * The API this build talks to. Resolved lazily and cached: resolution can throw
 * (a production build with EXPO_PUBLIC_API_URL unset), and a throw at module load
 * would take the whole bundle down instead of the one screen that made a request.
 */
export function getApiBaseUrl(): string {
  if (cachedBaseUrl === null) {
    cachedBaseUrl = resolveApiBaseUrl({
      // Written as a literal property access: the Expo bundler inlines
      // EXPO_PUBLIC_* only where it can see one.
      envUrl: process.env.EXPO_PUBLIC_API_URL,
      hostUri: Constants.expoConfig?.hostUri,
      isDev: __DEV__,
    });
  }
  return cachedBaseUrl;
}

/** GET /api/species */
export async function getSpecies(
  params: { category?: string } = {},
  options?: RequestOptions,
): Promise<Species[]> {
  const { species } = await getJson<{ species: Species[] }>(
    buildUrl(getApiBaseUrl(), '/api/species', params),
    options,
  );
  return species;
}

/**
 * GET /api/geo/zip/:zip
 *
 * Unlike apps/web's client these three geocoders do not swallow failures into
 * null — a hunter who typed a ZIP that does not exist should be told so, and the
 * API already sends a usable message.
 */
export async function geocodeZip(zip: string, options?: RequestOptions): Promise<GeoLocation> {
  return getJson<GeoLocation>(
    buildUrl(getApiBaseUrl(), `/api/geo/zip/${encodeURIComponent(zip)}`),
    options,
  );
}

/** GET /api/geo/search — free-text city or place, e.g. "Stuttgart AR" */
export async function geocodeSearch(q: string, options?: RequestOptions): Promise<GeoLocation> {
  return getJson<GeoLocation>(buildUrl(getApiBaseUrl(), '/api/geo/search', { q }), options);
}

/** GET /api/geo/reverse — device coordinates to a place name */
export async function geocodeReverse(
  coords: Coordinates,
  options?: RequestOptions,
): Promise<GeoLocation> {
  return getJson<GeoLocation>(
    buildUrl(getApiBaseUrl(), '/api/geo/reverse', { lat: coords.lat, lng: coords.lng }),
    options,
  );
}

export interface HuntRecommendationsParams {
  /** Species slug, e.g. "snow-goose". Omitted means all waterfowl. */
  species?: string;
  /** Comma-separated state codes. Omitted means all V1 states. */
  states?: string;
  /** Target date YYYY-MM-DD. Omitted means today. */
  date?: string;
  limit?: number;
}

export interface DecoratedHuntRecommendations
  extends Omit<HuntRecommendationsResponse, 'recommendations'> {
  recommendations: DecoratedRecommendation[];
}

/**
 * GET /api/hunt/recommendations
 *
 * `origin` is the hunter's position and is never sent to the API — the endpoint
 * takes no coordinates. It is used locally to attach a distance to each row.
 */
export async function getHuntRecommendations(
  params: HuntRecommendationsParams = {},
  origin?: Coordinates | null,
  options?: RequestOptions,
): Promise<DecoratedHuntRecommendations> {
  const response = await getJson<HuntRecommendationsResponse>(
    buildUrl(getApiBaseUrl(), '/api/hunt/recommendations', { ...params }),
    options,
  );
  return {
    ...response,
    recommendations: response.recommendations.map((rec: HuntRecommendation) =>
      decorateRecommendation(rec, origin),
    ),
  };
}
