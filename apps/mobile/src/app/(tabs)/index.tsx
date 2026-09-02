/**
 * "Where should I hunt this weekend?" — Killer Feature 1 on a phone.
 *
 * The screen owns four things: which species, where the hunter is, the ranked
 * list, and how it is ordered. Everything it decides that is not layout lives in
 * lib/huntList.ts under vitest; what is left here is state and rendering.
 */
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { ListMessage } from '@/components/ListMessage';
import { RecommendationCard } from '@/components/RecommendationCard';
import { SpeciesChips, type SpeciesOption } from '@/components/SpeciesChips';
import { LocationBar } from '@/components/LocationBar';
import { useHunterLocation } from '@/hooks/useHunterLocation';
import { getHuntRecommendations, getSpecies, type DecoratedHuntRecommendations } from '@/lib/api';
import {
  describeListState,
  humanizeError,
  recommendationKey,
  sortRecommendations,
  type SortMode,
} from '@/lib/huntList';
import { setLoadedRecommendations } from '@/lib/loadedResults';
import { decorateRecommendation } from '@/lib/recommendations';
import { loadLastLocation, loadLastSpecies, saveLastSpecies } from '@/lib/storage';
import { palette, SPACING, TOUCH_TARGET } from '@/theme';

const ALL_WATERFOWL: SpeciesOption = { slug: null, name: 'All waterfowl' };

export default function WhereToHuntScreen() {
  const c = palette(useColorScheme());
  const router = useRouter();
  const navigation = useNavigation();
  const location = useHunterLocation();

  const [speciesOptions, setSpeciesOptions] = useState<SpeciesOption[]>([ALL_WATERFOWL]);
  const [species, setSpecies] = useState<string | null>(null);
  const [response, setResponse] = useState<DecoratedHuntRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('rank');
  // Nothing is fetched until the remembered species and location are back, so a
  // cold start does not fire one request for the default and a second for the
  // preference a few milliseconds later.
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const { restore } = location;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [lastSpecies, lastLocation] = await Promise.all([loadLastSpecies(), loadLastLocation()]);
      if (cancelled) return;
      if (lastSpecies) setSpecies(lastSpecies);
      if (lastLocation) {
        restore(lastLocation);
        setSortMode('distance');
      }
      setPreferencesLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [restore]);

  useEffect(() => {
    let cancelled = false;
    getSpecies({ category: 'waterfowl' })
      .then((rows) => {
        if (cancelled) return;
        setSpeciesOptions([ALL_WATERFOWL, ...rows.map((s) => ({ slug: s.slug, name: s.name }))]);
      })
      .catch(() => {
        // The picker degrades to "All waterfowl", which is the API's own default
        // and still returns a full list — no reason to fail the screen over it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Guards against a slow request for an old species overwriting a newer one.
  const requestId = useRef(0);

  const load = useCallback(
    async (isRefresh: boolean) => {
      const id = ++requestId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        // origin is null on purpose: distances are attached below so that moving
        // the location pin re-sorts the list without another round trip.
        const next = await getHuntRecommendations({ species: species ?? undefined, limit: 25 }, null);
        if (id !== requestId.current) return;
        setResponse(next);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(humanizeError(err));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [species],
  );

  useEffect(() => {
    if (!preferencesLoaded) return;
    // set-state-in-effect fires because load() flips the loading/error state
    // synchronously before it awaits. That is the fetch-on-mount transition, not a
    // derived-state loop: this runs once when the stored preferences arrive and
    // again only when `species` changes, and requestId guards a stale overwrite.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
  }, [preferencesLoaded, load]);

  const origin = useMemo(
    () =>
      location.location ? { lat: location.location.lat, lng: location.location.lng } : null,
    [location.location],
  );

  const rows = useMemo(() => {
    if (!response) return [];
    // Re-decorated rather than re-fetched: decorateRecommendation is the same
    // call the client made with a null origin, so attaching distances here is
    // what lets a new location re-sort a list that is already on screen.
    const decorated = response.recommendations.map((rec) => decorateRecommendation(rec, origin));
    return sortRecommendations(decorated, origin ? sortMode : 'rank');
  }, [response, origin, sortMode]);

  // The detail route reads from here rather than from a serialised route param.
  useEffect(() => {
    setLoadedRecommendations(rows);
  }, [rows]);

  const headerTitle = location.location?.label ?? 'Where to Hunt';
  useEffect(() => {
    navigation.setOptions({ headerTitle });
  }, [navigation, headerTitle]);

  const selectSpecies = (slug: string | null) => {
    setSpecies(slug);
    void saveLastSpecies(slug);
  };

  const speciesLabel =
    speciesOptions.find((option) => option.slug === species)?.name ?? ALL_WATERFOWL.name;

  const listState = describeListState({ loading, error, response, speciesLabel });

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <LocationBar
        location={location.location}
        busy={location.busy}
        message={location.message}
        permissionDenied={location.permissionDenied}
        onUseDeviceLocation={() => void location.useDeviceLocation()}
        onSubmitTyped={(input) => {
          void location.useTypedLocation(input);
          setSortMode('distance');
        }}
        onClear={() => {
          location.clear();
          setSortMode('rank');
        }}
      />

      <SpeciesChips options={speciesOptions} selected={species} onSelect={selectSpecies} />

      {origin ? (
        <View style={styles.sortRow}>
          <SortButton
            label="Best first"
            active={sortMode === 'rank'}
            onPress={() => setSortMode('rank')}
          />
          <SortButton
            label="Closest first"
            active={sortMode === 'distance'}
            onPress={() => setSortMode('distance')}
          />
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={recommendationKey}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <RecommendationCard
            recommendation={item}
            onPress={() =>
              router.push({
                pathname: '/recommendation/[id]',
                params: { id: recommendationKey(item) },
              })
            }
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={c.accent}
          />
        }
        ListEmptyComponent={
          listState.kind === 'loading' ? (
            <ListMessage busy title="Scoring locations…" detail="Ranking refuges for this weekend." />
          ) : listState.kind === 'ready' ? null : (
            <ListMessage
              title={listState.title}
              detail={listState.detail}
              onRetry={() => void load(false)}
            />
          )
        }
      />
    </View>
  );
}

function SortButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = palette(useColorScheme());
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.sortButton, { borderColor: active ? c.accent : c.border }]}
    >
      <Text style={[styles.sortText, { color: active ? c.accent : c.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  sortRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  sortButton: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderRadius: SPACING.sm,
  },
  sortText: {
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: SPACING.lg,
    paddingTop: 0,
    gap: SPACING.md,
  },
});
