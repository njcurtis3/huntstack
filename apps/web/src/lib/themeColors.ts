/**
 * GitHub Primer-inspired colors for SVG maps and Recharts.
 */

export function getMapColors(resolvedTheme: 'light' | 'dark') {
  const isDark = resolvedTheme === 'dark'
  return {
    empty: isDark ? '#161b22' : '#f6f8fa',
    stroke: isDark ? '#30363d' : '#d0d7de',
    hasData: isDark ? '#238636' : '#dafbe1',
    hasDataHover: isDark ? '#2ea043' : '#aceebb',
    selected: isDark ? '#1f6feb' : '#0969da',
    selectedHover: isDark ? '#2f81f7' : '#0550ae',
  }
}

export function getChartColors(resolvedTheme: 'light' | 'dark') {
  const isDark = resolvedTheme === 'dark'
  return {
    grid: isDark ? '#21262d' : '#d0d7de',
    axis: isDark ? '#7d8590' : '#656d76',
    tooltipBg: isDark ? '#161b22' : '#ffffff',
    tooltipBorder: isDark ? '#30363d' : '#d0d7de',
    tooltipText: isDark ? '#e6edf3' : '#1f2328',
  }
}
