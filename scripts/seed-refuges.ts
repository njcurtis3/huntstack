/**
 * Seed script for National Wildlife Refuge locations.
 *
 * Populates the `locations` table with wildlife refuges in V1 priority states
 * (TX, NM, AR, LA, KS, OK) that publish waterfowl survey data.
 *
 * Also creates statewide MWI aggregate location records for Mid-Winter
 * Inventory annual data.
 *
 * Run: npx tsx scripts/seed-refuges.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import 'dotenv/config'
import { states, locations } from '../packages/db/src/schema/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

// ============================================
// REFUGE DATA
// ============================================

interface RefugeData {
  name: string
  stateCode: string
  lat: number
  lng: number
  websiteUrl: string
  flyway: string
  surveyUrl?: string
  acreage?: number
}

const refugeData: RefugeData[] = [
  // Oklahoma
  {
    name: 'Washita National Wildlife Refuge',
    stateCode: 'OK',
    lat: 35.15, lng: -99.06,
    websiteUrl: 'https://www.fws.gov/refuge/washita',
    flyway: 'central',
    surveyUrl: 'https://www.fws.gov/refuge/washita/latest-waterfowl-survey',
    acreage: 8200,
  },
  {
    name: 'Salt Plains National Wildlife Refuge',
    stateCode: 'OK',
    lat: 36.74, lng: -98.21,
    websiteUrl: 'https://www.fws.gov/refuge/salt-plains',
    flyway: 'central',
    surveyUrl: 'https://www.fws.gov/story/weekly-waterfowl-survey',
    acreage: 32080,
  },
  {
    name: 'Sequoyah National Wildlife Refuge',
    stateCode: 'OK',
    lat: 35.46, lng: -95.18,
    websiteUrl: 'https://www.fws.gov/refuge/sequoyah',
    flyway: 'central',
    acreage: 20800,
  },
  {
    name: 'Tishomingo National Wildlife Refuge',
    stateCode: 'OK',
    lat: 34.19, lng: -96.63,
    websiteUrl: 'https://www.fws.gov/refuge/tishomingo',
    flyway: 'central',
    acreage: 16464,
  },
  // Texas
  {
    name: 'Anahuac National Wildlife Refuge',
    stateCode: 'TX',
    lat: 29.61, lng: -94.53,
    websiteUrl: 'https://www.fws.gov/refuge/anahuac',
    flyway: 'central',
    acreage: 34000,
  },
  {
    name: 'Aransas National Wildlife Refuge',
    stateCode: 'TX',
    lat: 28.30, lng: -96.82,
    websiteUrl: 'https://www.fws.gov/refuge/aransas',
    flyway: 'central',
    acreage: 115000,
  },
  {
    name: 'Laguna Atascosa National Wildlife Refuge',
    stateCode: 'TX',
    lat: 26.22, lng: -97.35,
    websiteUrl: 'https://www.fws.gov/refuge/laguna-atascosa',
    flyway: 'central',
    acreage: 97007,
  },
  {
    name: 'Muleshoe National Wildlife Refuge',
    stateCode: 'TX',
    lat: 33.95, lng: -102.77,
    websiteUrl: 'https://www.fws.gov/refuge/muleshoe',
    flyway: 'central',
    acreage: 6440,
  },
  {
    name: 'Buffalo Lake National Wildlife Refuge',
    stateCode: 'TX',
    lat: 34.92, lng: -102.11,
    websiteUrl: 'https://www.fws.gov/refuge/buffalo-lake',
    flyway: 'central',
    acreage: 7664,
  },
  // Arkansas
  {
    name: 'Holla Bend National Wildlife Refuge',
    stateCode: 'AR',
    lat: 35.13, lng: -93.08,
    websiteUrl: 'https://www.fws.gov/refuge/holla-bend',
    flyway: 'mississippi',
    acreage: 7055,
  },
  {
    name: 'Wapanocca National Wildlife Refuge',
    stateCode: 'AR',
    lat: 35.28, lng: -90.26,
    websiteUrl: 'https://www.fws.gov/refuge/wapanocca',
    flyway: 'mississippi',
    acreage: 5485,
  },
  {
    name: 'Cache River National Wildlife Refuge',
    stateCode: 'AR',
    lat: 35.10, lng: -91.32,
    websiteUrl: 'https://www.fws.gov/refuge/cache-river',
    flyway: 'mississippi',
    acreage: 72000,
  },
  {
    name: 'White River National Wildlife Refuge',
    stateCode: 'AR',
    lat: 34.33, lng: -91.13,
    websiteUrl: 'https://www.fws.gov/refuge/white-river',
    flyway: 'mississippi',
    acreage: 160000,
  },
  // Louisiana
  {
    name: 'Lacassine National Wildlife Refuge',
    stateCode: 'LA',
    lat: 30.00, lng: -92.81,
    websiteUrl: 'https://www.fws.gov/refuge/lacassine',
    flyway: 'mississippi',
    acreage: 35000,
  },
  {
    name: 'Cameron Prairie National Wildlife Refuge',
    stateCode: 'LA',
    lat: 29.87, lng: -93.14,
    websiteUrl: 'https://www.fws.gov/refuge/cameron-prairie',
    flyway: 'mississippi',
    acreage: 24548,
  },
  {
    name: 'Sabine National Wildlife Refuge',
    stateCode: 'LA',
    lat: 29.93, lng: -93.43,
    websiteUrl: 'https://www.fws.gov/refuge/sabine',
    flyway: 'mississippi',
    acreage: 125000,
  },
  {
    name: 'Catahoula National Wildlife Refuge',
    stateCode: 'LA',
    lat: 31.38, lng: -91.86,
    websiteUrl: 'https://www.fws.gov/refuge/catahoula',
    flyway: 'mississippi',
    acreage: 25162,
  },
  // New Mexico
  {
    name: 'Bosque del Apache National Wildlife Refuge',
    stateCode: 'NM',
    lat: 33.80, lng: -106.89,
    websiteUrl: 'https://www.fws.gov/refuge/bosque-del-apache',
    flyway: 'central',
    acreage: 57331,
  },
  {
    name: 'Bitter Lake National Wildlife Refuge',
    stateCode: 'NM',
    lat: 33.48, lng: -104.40,
    websiteUrl: 'https://www.fws.gov/refuge/bitter-lake',
    flyway: 'central',
    acreage: 24536,
  },
  {
    name: 'Las Vegas National Wildlife Refuge',
    stateCode: 'NM',
    lat: 35.62, lng: -105.23,
    websiteUrl: 'https://www.fws.gov/refuge/las-vegas',
    flyway: 'central',
    acreage: 8672,
  },
  // Kansas
  {
    name: 'Quivira National Wildlife Refuge',
    stateCode: 'KS',
    lat: 38.13, lng: -98.48,
    websiteUrl: 'https://www.fws.gov/refuge/quivira',
    flyway: 'central',
    acreage: 22135,
  },
  {
    name: 'Flint Hills National Wildlife Refuge',
    stateCode: 'KS',
    lat: 38.32, lng: -96.23,
    websiteUrl: 'https://www.fws.gov/refuge/flint-hills',
    flyway: 'central',
    acreage: 18463,
  },
]

// ============================================
// SEED FUNCTION
// ============================================

async function seed() {
  console.log('Seeding refuge locations...\n')

  // Load state code -> id mapping
  const allStates = await db.select().from(states)
  const stateMap: Record<string, string> = {}
  for (const s of allStates) {
    stateMap[s.code] = s.id
  }

  // Insert refuge locations
  let insertedCount = 0
  for (const refuge of refugeData) {
    const stateId = stateMap[refuge.stateCode]
    if (!stateId) {
      console.log(`  SKIP: ${refuge.name} — state ${refuge.stateCode} not found`)
      continue
    }

    const result = await db
      .insert(locations)
      .values({
        name: refuge.name,
        locationType: 'wildlife_refuge',
        stateId,
        acreage: refuge.acreage,
        centerPoint: { lat: refuge.lat, lng: refuge.lng },
        websiteUrl: refuge.websiteUrl,
        metadata: {
          flyway: refuge.flyway,
          surveyUrl: refuge.surveyUrl || null,
          source: 'usfws',
        },
      })
      .onConflictDoNothing()
      .returning()

    if (result.length > 0) {
      console.log(`  ${refuge.stateCode} - ${refuge.name}`)
      insertedCount++
    }
  }

  // Insert statewide MWI aggregate records
  console.log('\nSeeding MWI statewide aggregate locations...')
  const v1States = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK']
  let mwiCount = 0
  for (const code of v1States) {
    const stateId = stateMap[code]
    if (!stateId) continue

    const stateName = allStates.find(s => s.code === code)?.name || code
    const result = await db
      .insert(locations)
      .values({
        name: `${stateName} - Statewide MWI`,
        locationType: 'wildlife_refuge',
        stateId,
        metadata: {
          isMwiAggregate: true,
          source: 'usfws_mwi',
        },
      })
      .onConflictDoNothing()
      .returning()

    if (result.length > 0) {
      console.log(`  ${code} - ${stateName} - Statewide MWI`)
      mwiCount++
    }
  }

  console.log(`\nDone! Inserted ${insertedCount} refuges and ${mwiCount} MWI aggregates.`)
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => {
    client.end()
  })
