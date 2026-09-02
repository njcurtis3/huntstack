/**
 * The loading, empty and error blocks, which are the same shape as each other.
 * Kept as one component so an empty list and a failed one cannot drift into
 * looking different for no reason.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { palette, SPACING, TOUCH_TARGET } from '@/theme';

interface Props {
  title: string;
  detail: string;
  busy?: boolean;
  /** Rendered only when given — loading has nothing to retry. */
  onRetry?: () => void;
}

export function ListMessage({ title, detail, busy = false, onRetry }: Props) {
  const c = palette(useColorScheme());

  return (
    <View style={styles.container}>
      {busy ? <ActivityIndicator size="large" color={c.accent} /> : null}
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      <Text style={[styles.detail, { color: c.textMuted }]}>{detail}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={[styles.retry, { backgroundColor: c.accent }]}
        >
          <Text style={[styles.retryText, { color: c.accentText }]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  detail: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  retry: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: SPACING.sm,
  },
  retryText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
