import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme
}

function applyTheme(resolved: 'light' | 'dark', animate = true) {
  const root = document.documentElement
  if (animate) root.classList.add('theme-transition')
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  if (animate) setTimeout(() => root.classList.remove('theme-transition'), 350)
}

// Read initial resolved theme from DOM (matches what the FOUC script set)
function getInitialResolved(): 'light' | 'dark' {
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  }
  return 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      resolvedTheme: getInitialResolved(),

      setTheme: (theme: Theme) => {
        const resolved = resolveTheme(theme)
        applyTheme(resolved)
        set({ theme, resolvedTheme: resolved })
      },
    }),
    {
      name: 'huntstack-theme',
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (state && !error) {
            // After rehydration completes, apply the theme based on the
            // persisted value (not the default). This fixes the race where
            // initialize() ran before hydration and used the wrong theme.
            const resolved = resolveTheme(state.theme)
            applyTheme(resolved, false)
            useThemeStore.setState({ resolvedTheme: resolved })
          }
        }
      },
    }
  )
)

// Listen for OS theme preference changes (module-level, runs once)
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useThemeStore.getState()
    if (theme === 'system') {
      const resolved = getSystemTheme()
      applyTheme(resolved)
      useThemeStore.setState({ resolvedTheme: resolved })
    }
  })
}
