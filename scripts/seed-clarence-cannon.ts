/**
 * Seed Clarence Cannon NWR location.
 *
 * Clarence Cannon NWR is in Annada, MO (Mississippi Flyway).
 * It publishes a wide-format HTML waterfowl survey table with ~25 weekly
 * date columns covering a full season (Oct–Mar).
 *
 * Run: npx tsx scripts/seed-clarence-cannon.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })

import { states, locations } from '../packages/db/src/schema/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

async function seed() {
  const [moState] = await db.select().from(states).where(eq(states.code, 'MO'))
  if (!moState) {
    console.error('MO state not found — run seed.ts first')
    process.exit(1)
  }

  console.log(`MO state id: ${moState.id}`)

  const result = await db
    .insert(locations)
    .values({
      name: 'Clarence Cannon National Wildlife Refuge',
      locationType: 'wildlife_refuge',
      stateId: moState.id,
      acreage: 3747,
      // Annada, MO — Mississippi River floodplain
      centerPoint: { lat: 39.27, lng: -91.08 },
      websiteUrl: 'https://www.fws.gov/refuge/clarence-cannon',
      metadata: {
        flyway: 'mississippi',
        surveyUrl: 'https://www.fws.gov/refuge/clarence-cannon/clarence-cannon-nwr-waterfowl-surveys',
        source: 'usfws',
      },
    })
    .onConflictDoNothing()
    .returning()

  if (result.length > 0) {
    console.log(`Inserted: Clarence Cannon NWR (id: ${result[0].id})`)
  } else {
    console.log('Already exists — no change.')
  }
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => client.end())
