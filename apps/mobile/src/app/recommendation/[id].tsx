/**
 * One recommendation, and why it ranked where it did.
 *
 * The score breakdown is the point of this screen. "Ranked #1" on its own asks a
 * hunter to trust a number; the breakdown shows that it is first because the
 * count is climbing and the season is open, which is a claim they can check.
 */
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

import {
  formatCount,
  formatDistance,
  migrationStatusLabel,
  scoreFactors,
  seasonLabel,
  trendGlyph,
  trendLabel,
  weatherRatingLabel,
} from '@/lib/huntList';
import { findLoadedRecommendation } from '@/lib/loadedResults';
import { palette, SPACING } from '@/theme';

export default function RecommendationDetailScreen() {
  const c = palette(useColorScheme());
  const { id } = useLocalSearchParams<{ id: string }>();
  const rec = id ? findLoadedRecommendation(id) : null;

  if (!rec) {
    return (
      <View style={[styles.missing, { backgroundColor: c.background }]}>
        <Text style={[styles.missingText, { color: c.textMuted }]}>
          This recommendation is not loaded. v1 keeps results in memory only, so open it again
          from the Where to Hunt list.
        </Text>
      </View>
    );
  }

  const distance = formatDistance(rec.distanceMiles);
  const factors = scoreFactors(rec.scoreBreakdown);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: c.text }]}>{rec.locationName}</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>
          {rec.stateName}
          {distance ? ` · ${distance}` : ''} · {rec.speciesName}
        </Text>
        <Text style={[styles.rank, { color: c.accent }]}>
          Ranked #{rec.rank} · score {rec.score}/100
        </Text>
      </View>

      <Card title="Why this score">
        {factors.map((factor) => (
          <View key={factor.key} style={styles.factorRow}>
            <Text style={[styles.factorLabel, { color: c.text }]}>{factor.label}</Text>
            <View style={[styles.barTrack, { backgroundColor: c.border }]}>
              <View
                style={[
                  styles.barFill,
                  { backgroundColor: c.accent, width: `${Math.round(factor.share * 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.factorValue, { color: c.textMuted }]}>{factor.value}</Text>
          </View>
        ))}
        <Text style={[styles.footnote, { color: c.textMuted }]}>
          Bars are relative to this location&apos;s largest factor. The API publishes the points
          each factor contributed, not a maximum for each one.
        </Text>
      </Card>

      <Card title="Birds">
        <Line label="Latest count" value={formatCount(rec.latestCount)} />
        <Line label="Trend" value={`${trendGlyph(rec.trend)} ${trendLabel(rec.trend)}`} />
        <Line label="Migration" value={migrationStatusLabel(rec.migrationStatus)} />
        <Line label="Surveyed" value={rec.surveyDate ?? 'No survey on record'} />
        {rec.isAnomaly ? <Line label="Note" value="Count is unusually high for this week" /> : null}
      </Card>

      <Card title="Season">
        <Line label="Status" value={seasonLabel(rec)} />
        <Line label="Season" value={rec.seasonName ?? 'No matching season found'} />
      </Card>

      <Card title="Weather">
        <Line label="Rating" value={weatherRatingLabel(rec.weatherRating)} />
        <Line
          label="Temperature"
          value={
            rec.temperature === null
              ? 'No forecast'
              : `${rec.temperature}°${rec.temperatureUnit ?? ''}`
          }
        />
        <Line label="Wind" value={rec.windSpeed ?? 'No forecast'} />
        <Line label="Conditions" value={rec.conditions ?? 'No forecast'} />
        <Line
          label="Cold front"
          value={
            rec.coldFrontPresent
              ? 'Front on the ground now'
              : rec.coldFrontIncoming
                ? 'Front on the way'
                : 'None in the forecast'
          }
        />
      </Card>
    </ScrollView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const c = palette(useColorScheme());
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.cardTitle, { color: c.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const c = palette(useColorScheme());
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  header: {
    gap: SPACING.xs,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
  },
  rank: {
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: SPACING.md,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  factorLabel: {
    fontSize: 16,
    width: 128,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: 10,
    borderRadius: 5,
  },
  factorValue: {
    fontSize: 16,
    minWidth: 28,
    textAlign: 'right',
  },
  footnote: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: SPACING.xs,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  lineLabel: {
    fontSize: 16,
    width: 128,
  },
  lineValue: {
    flex: 1,
    fontSize: 16,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  missingText: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
});
