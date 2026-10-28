import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@huntstack/db/schema'

let _db: PostgresJsDatabase<typeof schema> | null = null

export function getDb() {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }
    // Supabase's session pooler allows 15 clients in total, shared by the live API, local test
    // servers and scrapers; postgres.js opens up to 10. DB_POOL_MAX lowers it (e.g. 3 for a local run).
    const max = Number(process.env.DB_POOL_MAX) || 10
    const queryClient = postgres(connectionString, { max })
    _db = drizzle(queryClient, { schema })
  }
  return _db
}
