/**
 * Settings / About — deliberately trivial.
 *
 * It exists so the shell is a shell, and so a tester holding the phone can see
 * which API this build is talking to. That is the single question that cannot be
 * answered from the outside: the dev URL is derived from whatever LAN address
 * Metro is serving on, so it differs per machine and per network.
 */
import Constants from 'expo-constants';
import { Platform, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { getApiBaseUrl } from '@/lib/api';
import { palette, SPACING } from '@/theme';

function describeApi(): { value: string; source: string } {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  try {
    return {
      value: getApiBaseUrl(),
      source: configured
        ? 'set by EXPO_PUBLIC_API_URL'
        : 'derived from the Metro dev server host, port 4000',
    };
  } catch (err) {
    return {
      value: err instanceof Error ? err.message : 'API URL could not be resolved.',
      source: 'not configured',
    };
  }
}

export default function SettingsScreen() {
  const c = palette(useColorScheme());
  const api = describeApi();

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
    >
      <Row label="API" value={api.value} note={api.source} />
      <Row label="App version" value={Constants.expoConfig?.version ?? 'unknown'} />
      <Row label="Expo SDK" value={Constants.expoConfig?.sdkVersion ?? 'unknown'} />
      <Row label="Platform" value={`${Platform.OS} ${String(Platform.Version)}`} />

      <Text style={[styles.about, { color: c.textMuted }]}>
        HuntStack tells you where to hunt. Rankings come from weekly refuge surveys, open season
        dates and the current weather — pre-hunt intelligence, not in-field navigation.
      </Text>
    </ScrollView>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  const c = palette(useColorScheme());
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: c.text }]} selectable>
        {value}
      </Text>
      {note ? <Text style={[styles.note, { color: c.textMuted }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  row: {
    borderWidth: 1,
    borderRadius: SPACING.md,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  value: {
    fontSize: 16,
  },
  note: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  about: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: SPACING.xs,
  },
});
