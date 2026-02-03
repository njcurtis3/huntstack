import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import path from 'path'

// Load .env from project root
config({ path: path.resolve(__dirname, '../../.env') })

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  tablesFilter: ['!geography_columns', '!geometry_columns', '!spatial_ref_sys'],
})