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
    const queryClient = postgres(connectionString)
    _db = drizzle(queryClient, { schema })
  }
  return _db
}
