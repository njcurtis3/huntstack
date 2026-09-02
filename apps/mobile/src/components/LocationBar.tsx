/**
 * Where the hunter is, and the two ways to say so.
 *
 * Both routes are always on screen. GPS is the fast one, but the ZIP/town field
 * is never hidden behind it and never disabled by a permission refusal — a
 * denied prompt should cost a hunter one extra tap, not the feature.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import type { HunterLocation } from '@/lib/location';
import { palette, SPACING, TOUCH_TARGET } from '@/theme';

interface Props {
  location: HunterLocation | null;
  busy: boolean;
  message: string | null;
  permissionDenied: boolean;
  onUseDeviceLocation: () => void;
  onSubmitTyped: (input: string) => void;
  onClear: () => void;
}

export function LocationBar({
  location,
  busy,
  message,
  permissionDenied,
  onUseDeviceLocation,
  onSubmitTyped,
  onClear,
}: Props) {
  const c = palette(useColorScheme());
  const [draft, setDraft] = useState('');

  const submit = () => {
    onSubmitTyped(draft);
    setDraft('');
  };

  return (
    <View style={[styles.container, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
      <View style={styles.row}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder={location ? location.label : 'ZIP code or town'}
          placeholderTextColor={c.textMuted}
          // Not inputMode="numeric": a town name is as valid an answer as 79101.
          inputMode="text"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="ZIP code or town"
          style={[styles.input, { borderColor: c.border, color: c.text }]}
        />
        <Pressable
          onPress={onUseDeviceLocation}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Use my current location"
          style={[styles.gpsButton, { backgroundColor: c.accent, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color={c.accentText} />
          ) : (
            <Text style={[styles.gpsGlyph, { color: c.accentText }]}>◎</Text>
          )}
        </Pressable>
      </View>

      {location ? (
        <View style={styles.row}>
          <Text style={[styles.current, { color: c.textMuted }]} numberOfLines={1}>
            Distances from {location.label}
          </Text>
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear location"
            style={styles.clearButton}
          >
            <Text style={[styles.clearText, { color: c.accent }]}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? (
        <Text style={[styles.message, { color: permissionDenied ? c.warn : c.bad }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    gap: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
  },
  gpsButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsGlyph: {
    fontSize: 22,
  },
  current: {
    flex: 1,
    fontSize: 16,
  },
  clearButton: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  clearText: {
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
  },
});
