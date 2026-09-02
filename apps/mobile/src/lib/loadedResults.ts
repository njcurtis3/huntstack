/**
 * The list screen's handoff to the detail route.
 *
 * expo-router carries strings in the URL, and a recommendation is a 30-field
 * object with a nested score breakdown — serialising it into a route param
 * would put the whole row in the deep link. Instead the list parks what it just
 * fetched here and the detail route looks it up by key. v1 does no offline
 * caching, so a detail opened without a list in memory (a cold deep link) has
 * nothing to show and says so rather than rendering blanks.
 */
import { recommendationKey } from './huntList';
import type { DecoratedRecommendation } from './recommendations';

let loaded: readonly DecoratedRecommendation[] = [];

export function setLoadedRecommendations(recommendations: readonly DecoratedRecommendation[]): void {
  loaded = recommendations;
}

export function findLoadedRecommendation(key: string): DecoratedRecommendation | null {
  return loaded.find((rec) => recommendationKey(rec) === key) ?? null;
}
