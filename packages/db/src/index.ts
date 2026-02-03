import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

// Create postgres connection
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// For query purposes
const queryClient = postgres(connectionString)
export const db = drizzle(queryClient, { schema })

// For migrations (uses a different client with max 1 connection)
const migrationClient = postgres(connectionString, { max: 1 })
export const migrationDb = drizzle(migrationClient, { schema })

// Re-export schema
export * from './schema/index.js'
