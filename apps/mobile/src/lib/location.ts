/**
 * Pure helpers for the hunter's own position.
 *
 * The expo-location calls themselves live in hooks/useHunterLocation.ts; only
 * the decisions live here, so vitest can run them under node.
 */
import type { Coordinates, GeoLocation } from './api.types';

export interface HunterLocation extends Coordinates {
  /** What the header shows: "Stuttgart, AR", or coordinates when unnamed. */
  label: string;
  /** How we got it — the manual path stays usable when GPS is denied. */
  source: 'gps' | 'manual';
}

/**
 * A 5-digit string means the ZIP endpoint; anything else is free text for the
 * search endpoint. Matches what apps/web does at WhereToHuntPage, and it is the
 * whole reason the input keyboard cannot be numeric-only.
 */
export function looksLikeZip(input: string): boolean {
  return /^\d{5}$/.test(input.trim());
}

/** Three decimal places is roughly 100m — enough to recognise, short enough to fit. */
export function formatCoordsLabel({ lat, lng }: Coordinates): string {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

/**
 * apps/api's geocoder returns city and state as non-nullable strings that may
 * still be empty (parseNominatimAddress), so an empty city is normal in open
 * country and must fall back rather than render ", TX".
 */
export function formatPlaceLabel(
  place: Pick<GeoLocation, 'city' | 'state'> | null,
  coords: Coordinates,
): string {
  const city = place?.city.trim() ?? '';
  const state = place?.state.trim() ?? '';
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return formatCoordsLabel(coords);
}
