/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // GitHub Primer green scale (primary actions, success)
        forest: {
          50: '#dafbe1',
          100: '#aceebb',
          200: '#6fdd8b',
          300: '#4ac26b',
          400: '#2da44e',
          500: '#1a7f37',
          600: '#1f883d',
          700: '#116329',
          800: '#0d4420',
          900: '#033a16',
          950: '#02160a',
        },
        // GitHub Primer neutral scale (secondary UI, muted elements)
        earth: {
          50: '#f6f8fa',
          100: '#eaeef2',
          200: '#d0d7de',
          300: '#afb8c1',
          400: '#8c959f',
          500: '#6e7781',
          600: '#57606a',
          700: '#424a53',
          800: '#32383f',
          900: '#24292f',
          950: '#1c2128',
        },
        // GitHub Primer blue accent
        accent: {
          50: '#ddf4ff',
          100: '#b6e3ff',
          200: '#80ccff',
          300: '#54aeff',
          400: '#218bff',
          500: '#0969da',
          600: '#0550ae',
          700: '#033d8b',
          800: '#0a3069',
          900: '#002155',
          950: '#001133',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Noto Sans', 'Helvetica', 'Arial', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji'],
      },
    },
  },
  plugins: [],
}
