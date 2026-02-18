export function getMapColors(resolvedTheme: 'light' | 'dark') {
  const isDark = resolvedTheme === 'dark'
  return {
    empty: isDark ? '#1f2937' : '#f3f4f6',
    stroke: isDark ? '#4b5563' : '#9ca3af',
    hasData: isDark ? '#166534' : '#bbf7d0',
    hasDataHover: isDark ? '#15803d' : '#86efac',
    selected: '#16a34a',
    selectedHover: '#15803d',
  }
}

export function getChartColors(resolvedTheme: 'light' | 'dark') {
  const isDark = resolvedTheme === 'dark'
  return {
    grid: isDark ? '#374151' : '#e5e7eb',
    axis: isDark ? '#9ca3af' : '#6b7280',
    tooltipBg: isDark ? '#1f2937' : '#ffffff',
    tooltipBorder: isDark ? '#374151' : '#e5e7eb',
    tooltipText: isDark ? '#f3f4f6' : '#1f2937',
  }
}
