import { StyleSheet, Text, View } from 'react-native';

import { getApiBaseUrl } from '@/lib/api';

/**
 * Placeholder route. The real "Where should I hunt this weekend?" screen replaces
 * this next; until then it shows which API this build resolved, which is the one
 * thing a tester on a phone cannot otherwise see — and it keeps the client on the
 * bundle's import graph, so `expo export` is really exercising it.
 */
function describeApi(): string {
  try {
    return getApiBaseUrl();
  } catch (err) {
    return err instanceof Error ? err.message : 'API URL could not be resolved.';
  }
}

export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>HuntStack</Text>
      <Text style={styles.subtitle}>Pre-hunt intelligence. Coming to your phone.</Text>
      <Text style={styles.apiLabel}>API</Text>
      <Text style={styles.api}>{describeApi()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  apiLabel: {
    marginTop: 24,
    fontSize: 12,
    letterSpacing: 1,
    opacity: 0.5,
  },
  api: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
});
