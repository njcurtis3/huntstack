/**
 * One ranked row. The whole card is the tap target, which is how a list behaves
 * on a phone — there is no small "details" link to miss with a thumb.
 */
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import {
  formatCount,
  formatDistance,
  migrationStatusLabel,
  seasonLabel,
  trendGlyph,
  trendLabel,
  weatherRatingLabel,
} from '@/lib/huntList';
import type { DecoratedRecommendation } from '@/lib/recommendations';
import { palette, SPACING, TOUCH_TARGET } from '@/theme';

interface Props {
  recommendation: DecoratedRecommendation;
  onPress: () => void;
}

export function RecommendationCard({ recommendation: rec, onPress }: Props) {
  const c = palette(useColorScheme());
  const distance = formatDistance(rec.distanceMiles);
  const trendColor =
    rec.trend === 'increasing' ? c.good : rec.trend === 'decreasing' ? c.bad : c.textMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${rec.locationName}, ${rec.stateName}, ranked ${rec.rank}`}
      accessibilityHint="Opens the score breakdown"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.rank, { backgroundColor: c.accent }]}>
          <Text style={[styles.rankText, { color: c.accentText }]}>{rec.rank}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: c.text }]}>{rec.locationName}</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            {rec.stateName}
            {distance ? ` · ${distance}` : ''} · {rec.speciesName}
          </Text>
        </View>
        <Text style={[styles.score, { color: c.textMuted }]}>{rec.score}</Text>
      </View>

      <Text style={[styles.count, { color: trendColor }]}>
        {trendGlyph(rec.trend)} {formatCount(rec.latestCount)} · {trendLabel(rec.trend)}
      </Text>

      <View style={styles.tagRow}>
        <Tag
          text={seasonLabel(rec)}
          color={rec.seasonOpen ? c.good : c.bad}
          borderColor={c.border}
        />
        <Tag text={migrationStatusLabel(rec.migrationStatus)} color={c.textMuted} borderColor={c.border} />
        <Tag text={weatherRatingLabel(rec.weatherRating)} color={c.textMuted} borderColor={c.border} />
      </View>
    </Pressable>
  );
}

function Tag({ text, color, borderColor }: { text: string; color: string; borderColor: string }) {
  return (
    <View style={[styles.tag, { borderColor }]}>
      <Text style={[styles.tagText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: SPACING.md,
    padding: SPACING.lg,
    gap: SPACING.sm,
    minHeight: TOUCH_TARGET,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  rank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
  },
  score: {
    fontSize: 16,
    fontWeight: '600',
  },
  count: {
    fontSize: 16,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tag: {
    borderWidth: 1,
    borderRadius: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  tagText: {
    fontSize: 16,
  },
});
