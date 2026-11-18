import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { statePagesPlugin } from './prerender/statePages'
import { staticPagesPlugin } from './prerender/staticPages'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), statePagesPlugin(), staticPagesPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
