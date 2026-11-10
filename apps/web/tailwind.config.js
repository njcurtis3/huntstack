/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Sharp corners everywhere: pages keep their rounded-* classes, the sizes behind them shrink
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '3px',
      md: '3px',
      lg: '4px',
      xl: '4px',
      '2xl': '4px',
      '3xl': '4px',
      full: '9999px',
    },
    // Flat surfaces: borders separate things, shadows are kept for menus and dialogs
    boxShadow: {
      none: 'none',
      sm: '0 1px 0 rgb(0 0 0 / 0.03)',
      DEFAULT: '0 1px 2px rgb(0 0 0 / 0.06)',
      md: '0 2px 8px rgb(0 0 0 / 0.08)',
      lg: '0 8px 24px rgb(0 0 0 / 0.12)',
      xl: '0 16px 40px rgb(0 0 0 / 0.18)',
      '2xl': '0 24px 56px rgb(0 0 0 / 0.24)',
      inner: 'inset 0 1px 2px rgb(0 0 0 / 0.06)',
    },
    extend: {
      colors: {
        // Field green: success, open seasons, rising counts
        forest: {
          50: '#e9f3ec',
          100: '#d3e8da',
          200: '#a9cdb4',
          300: '#76b28a',
          400: '#5acb86',
          500: '#2f8f55',
          600: '#1c6b37',
          700: '#17592e',
          800: '#124524',
          900: '#0c2f19',
          950: '#12261a',
        },
        // Graphite neutrals: text, borders, surfaces, the dark header and heroes
        earth: {
          50: '#f7f7f8',
          100: '#eff0f2',
          200: '#e6e8eb',
          300: '#d4d7db',
          400: '#8a9098',
          500: '#6b7178',
          600: '#50565d',
          700: '#33373c',
          800: '#1a1d20',
          900: '#111315',
          950: '#0b0c0d',
        },
        // Blaze orange: primary actions, links, the selected item
        accent: {
          50: '#fff4ec',
          100: '#ffe4d1',
          200: '#fbc9a6',
          300: '#f4a06b',
          400: '#f28a4e',
          500: '#c2410c',
          600: '#b23b0b',
          700: '#9a3412',
          800: '#7c2d12',
          900: '#431407',
          950: '#2a1a10',
        },
      },
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
