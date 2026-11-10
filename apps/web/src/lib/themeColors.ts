/**
 * Colors for the SVG maps and Recharts, matching the graphite + blaze orange theme in index.css.
 */

export function getMapColors(resolvedTheme: 'light' | 'dark') {
  const isDark = resolvedTheme === 'dark'
  return {
    empty: isDark ? '#1a1d20' : '#ecedef',
    stroke: isDark ? '#0b0c0d' : '#ffffff',
    hasData: isDark ? '#5b3018' : '#f4cdb1',
    hasDataHover: isDark ? '#7a3f1d' : '#eeb289',
    selected: isDark ? '#e2561b' : '#c2410c',
    selectedHover: isDark ? '#f28a4e' : '#9a3412',
  }
}

export function getChartColors(resolvedTheme: 'light' | 'dark') {
  const isDark = resolvedTheme === 'dark'
  return {
    grid: isDark ? '#24272b' : '#e6e8eb',
    axis: isDark ? '#8a9098' : '#6b7178',
    tooltipBg: isDark ? '#121416' : '#ffffff',
    tooltipBorder: isDark ? '#33373c' : '#d4d7db',
    tooltipText: isDark ? '#ecedee' : '#111315',
  }
}
