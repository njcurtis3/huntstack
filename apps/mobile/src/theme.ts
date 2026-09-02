/**
 * The app's colours and spacing, in one place.
 *
 * Two palettes rather than a theming library: the root layout already picks
 * light or dark from useColorScheme() for react-navigation's chrome, and this
 * keeps the screens agreeing with it without adding a dependency.
 *
 * SPACING is a 4pt scale; TOUCH_TARGET is the floor every pressable honours —
 *
 * palette() takes useColorScheme()'s own return type, including the
 * 'unspecified' value it can produce, rather than making every caller narrow it.
 * see graph_agents/conventions/mobile-first.md. The width tiers in that document
 * describe a web layout and do not apply to a native app; the 44pt touch target
 * and one-handed reach do, and are the parts observed here.
 */
import type { ColorSchemeName } from 'react-native';

export const TOUCH_TARGET = 44;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export interface Palette {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  good: string;
  warn: string;
  bad: string;
}

const light: Palette = {
  background: '#F6F7F5',
  surface: '#FFFFFF',
  border: '#DFE2DC',
  text: '#16211A',
  textMuted: '#5B665F',
  accent: '#1F6F43',
  accentText: '#FFFFFF',
  good: '#1F6F43',
  warn: '#9A6A12',
  bad: '#9B3025',
};

const dark: Palette = {
  background: '#101511',
  surface: '#1A211C',
  border: '#2C352E',
  text: '#ECF1ED',
  textMuted: '#A0ACA4',
  accent: '#5FC98C',
  accentText: '#0C1610',
  good: '#5FC98C',
  warn: '#E0B05A',
  bad: '#E58273',
};

export function palette(scheme: ColorSchemeName): Palette {
  return scheme === 'dark' ? dark : light;
}
