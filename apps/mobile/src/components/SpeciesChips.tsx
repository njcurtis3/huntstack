/**
 * The species filter, as a horizontally scrolling row of chips.
 *
 * A chip row rather than a dropdown: waterfowl is a short list, a chip is a
 * 44pt target with no modal in the way, and the current choice stays visible
 * while the list below it reloads.
 */
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';

import { palette, SPACING, TOUCH_TARGET } from '@/theme';

export interface SpeciesOption {
  /** null is the "All waterfowl" chip — the API's own default. */
  slug: string | null;
  name: string;
}

interface Props {
  options: readonly SpeciesOption[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}

export function SpeciesChips({ options, selected, onSelect }: Props) {
  const c = palette(useColorScheme());

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const active = option.slug === selected;
        return (
          <Pressable
            key={option.slug ?? 'all'}
            onPress={() => onSelect(option.slug)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.name}
            style={[
              styles.chip,
              {
                backgroundColor: active ? c.accent : c.surface,
                borderColor: active ? c.accent : c.border,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? c.accentText : c.text }]}>
              {option.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  chip: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: TOUCH_TARGET / 2,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
