/**
 * The hunter's position: device GPS first, typed ZIP or place name always.
 *
 * The device half is why this file is a hook and not a plain module — it is the
 * only place expo-location is imported, so every decision it makes lives in
 * lib/location.ts where vitest can reach it.
 *
 * Denying location permission is a supported path, not a failure: the whole
 * screen still works from a typed ZIP, and the message says so instead of
 * dead-ending on "permission denied".
 */
import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

import { geocodeReverse, geocodeSearch, geocodeZip } from '@/lib/api';
import { humanizeError } from '@/lib/huntList';
import { formatCoordsLabel, formatPlaceLabel, looksLikeZip, type HunterLocation } from '@/lib/location';
import { saveLastLocation } from '@/lib/storage';

export interface HunterLocationState {
  location: HunterLocation | null;
  /** True while GPS or a geocode is in flight. */
  busy: boolean;
  /** Shown under the location bar; null when there is nothing to say. */
  message: string | null;
  /** The OS refused GPS. Manual entry is then the only route, and is offered. */
  permissionDenied: boolean;
  useDeviceLocation: () => Promise<void>;
  useTypedLocation: (input: string) => Promise<void>;
  restore: (location: HunterLocation) => void;
  clear: () => void;
}

export function useHunterLocation(): HunterLocationState {
  const [location, setLocation] = useState<HunterLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const commit = useCallback((next: HunterLocation) => {
    setLocation(next);
    void saveLastLocation(next);
  }, []);

  const useDeviceLocation = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setMessage('Location is off for HuntStack. Type a ZIP code or a town below instead.');
        return;
      }
      setPermissionDenied(false);

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: position.coords.latitude, lng: position.coords.longitude };

      // The fix is already useful without a name, so a failing reverse geocode
      // degrades to coordinates rather than throwing the position away.
      try {
        const place = await geocodeReverse(coords);
        commit({ ...coords, label: formatPlaceLabel(place, coords), source: 'gps' });
      } catch {
        commit({ ...coords, label: formatCoordsLabel(coords), source: 'gps' });
      }
    } catch (err) {
      setMessage(humanizeError(err));
    } finally {
      setBusy(false);
    }
  }, [commit]);

  const useTypedLocation = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      setBusy(true);
      setMessage(null);
      try {
        const place = looksLikeZip(trimmed)
          ? await geocodeZip(trimmed)
          : await geocodeSearch(trimmed);
        const coords = { lat: place.lat, lng: place.lng };
        commit({ ...coords, label: formatPlaceLabel(place, coords), source: 'manual' });
      } catch (err) {
        setMessage(humanizeError(err));
      } finally {
        setBusy(false);
      }
    },
    [commit],
  );

  const restore = useCallback((next: HunterLocation) => {
    setLocation(next);
  }, []);

  const clear = useCallback(() => {
    setLocation(null);
    setMessage(null);
    void saveLastLocation(null);
  }, []);

  return {
    location,
    busy,
    message,
    permissionDenied,
    useDeviceLocation,
    useTypedLocation,
    restore,
    clear,
  };
}
