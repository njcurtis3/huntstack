/**
 * Last-used species and location, remembered between launches.
 *
 * AsyncStorage, not localStorage: apps/web's ChatPage persists to localStorage,
 * which does not exist in React Native. Every read is best-effort — a hunter who
 * cannot read a preference should still get a working screen, so failures
 * resolve to null instead of throwing into a render.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HunterLocation } from './location';

const SPECIES_KEY = 'huntstack.lastSpecies';
const LOCATION_KEY = 'huntstack.lastLocation';

/** null means "All waterfowl" and is stored as a removal, not as the string "null". */
export async function loadLastSpecies(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SPECIES_KEY);
  } catch {
    return null;
  }
}

export async function saveLastSpecies(slug: string | null): Promise<void> {
  try {
    if (slug === null) await AsyncStorage.removeItem(SPECIES_KEY);
    else await AsyncStorage.setItem(SPECIES_KEY, slug);
  } catch {
    // A preference that will not persist is not worth interrupting a hunt plan for.
  }
}

export async function loadLastLocation(): Promise<HunterLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HunterLocation>;
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
    return {
      lat: parsed.lat,
      lng: parsed.lng,
      label: typeof parsed.label === 'string' ? parsed.label : '',
      // A remembered position is never fresh GPS, whatever it was last time.
      source: 'manual',
    };
  } catch {
    return null;
  }
}

export async function saveLastLocation(location: HunterLocation | null): Promise<void> {
  try {
    if (location === null) await AsyncStorage.removeItem(LOCATION_KEY);
    else await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(location));
  } catch {
    // Same as above: losing the memory is not worth a visible failure.
  }
}
