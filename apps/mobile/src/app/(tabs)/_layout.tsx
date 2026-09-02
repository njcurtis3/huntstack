import { Tabs } from 'expo-router';
import { StyleSheet, Text, useColorScheme, type ColorValue } from 'react-native';

import { palette } from '@/theme';

/**
 * Two tabs, and no icon library. @expo/vector-icons is not a declared dependency
 * of this package and pnpm's isolated layout will not resolve a transitive one,
 * so the icons are text glyphs rather than a dependency added for two pictures.
 */
function TabGlyph({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={[styles.glyph, { color }]}>{glyph}</Text>;
}

export default function TabsLayout() {
  const c = palette(useColorScheme());

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Where to Hunt',
          tabBarLabel: 'Where to Hunt',
          tabBarIcon: ({ color }) => <TabGlyph glyph="◎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabGlyph glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  glyph: {
    fontSize: 22,
    lineHeight: 26,
  },
  tabLabel: {
    fontSize: 12,
  },
});
