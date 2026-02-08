/**
 * Seed script for V1 waterfowl regulation data.
 *
 * Priority states: TX, NM, AR, LA, KS, OK (Central + Mississippi Flyways)
 *
 * IMPORTANT: Dates and prices are based on 2024-2025 season frameworks.
 * Verify against current USFWS frameworks and state agency publications
 * before each season. Hunting regulations have legal implications.
 *
 * Run: npx tsx scripts/seed-waterfowl.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import 'dotenv/config'
import {
  states,
  species,
  regulations,
  seasons,
  licenses,
} from '../packages/db/src/schema/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

// ============================================
// V1 PRIORITY STATES (add missing ones)
// ============================================

const newStates = [
  {
    code: 'NM',
    name: 'New Mexico',
    agencyName: 'New Mexico Department of Game and Fish',
    agencyUrl: 'https://www.wildlife.state.nm.us',
    regulationsUrl: 'https://www.wildlife.state.nm.us/hunting/regulations-and-rules/',
    licenseUrl: 'https://onlinesales.wildlife.state.nm.us',
  },
  {
    code: 'LA',
    name: 'Louisiana',
    agencyName: 'Louisiana Department of Wildlife and Fisheries',
    agencyUrl: 'https://www.wlf.louisiana.gov',
    regulationsUrl: 'https://www.wlf.louisiana.gov/page/hunting-regulations',
    licenseUrl: 'https://www.wlf.louisiana.gov/page/purchase-a-license',
  },
  {
    code: 'KS',
    name: 'Kansas',
    agencyName: 'Kansas Department of Wildlife and Parks',
    agencyUrl: 'https://ksoutdoors.com',
    regulationsUrl: 'https://ksoutdoors.com/Hunting/Migratory-Birds',
    licenseUrl: 'https://ksoutdoors.com/License-Permits',
  },
  {
    code: 'OK',
    name: 'Oklahoma',
    agencyName: 'Oklahoma Department of Wildlife Conservation',
    agencyUrl: 'https://www.wildlifedepartment.com',
    regulationsUrl: 'https://www.wildlifedepartment.com/hunting/migratory-birds',
    licenseUrl: 'https://www.wildlifedepartment.com/licensing',
  },
]

// ============================================
// ADDITIONAL WATERFOWL SPECIES
// ============================================

const newSpecies = [
  {
    slug: 'snow-goose',
    name: 'Snow Goose',
    scientificName: 'Anser caerulescens',
    category: 'waterfowl' as const,
    description: 'A medium-sized goose with two color morphs (white and blue). Snow goose populations have exploded, leading to conservation orders allowing extended hunting to control overabundant populations that are damaging Arctic breeding habitat.',
    habitat: 'Agricultural fields, coastal marshes, shallow lakes, and tundra breeding grounds.',
    isMigratory: true,
    flyways: ['central', 'mississippi', 'atlantic'],
  },
  {
    slug: 'ross-goose',
    name: "Ross's Goose",
    scientificName: 'Anser rossii',
    category: 'waterfowl' as const,
    description: "The smallest white goose in North America. Often found mixed with snow goose flocks and subject to the same conservation order provisions. Difficult to distinguish from snow geese at distance.",
    habitat: 'Agricultural fields, marshes, and prairie wetlands. Breeds in Arctic tundra.',
    isMigratory: true,
    flyways: ['central', 'mississippi'],
  },
  {
    slug: 'white-fronted-goose',
    name: 'Greater White-fronted Goose',
    scientificName: 'Anser albifrons',
    category: 'waterfowl' as const,
    description: 'Known as "specklebelly" by hunters due to the dark barring on the belly. Highly prized table fare and a challenging hunt. Common in the Central and Pacific flyways.',
    habitat: 'Wet meadows, agricultural fields, marshes, and tundra breeding grounds.',
    isMigratory: true,
    flyways: ['pacific', 'central', 'mississippi'],
  },
  {
    slug: 'green-winged-teal',
    name: 'Green-winged Teal',
    scientificName: 'Anas crecca',
    category: 'waterfowl' as const,
    description: 'The smallest dabbling duck in North America. Fast flyers that often arrive early and leave late in migration. Popular in early teal seasons across the Central and Mississippi flyways.',
    habitat: 'Shallow marshes, mudflats, flooded agricultural fields, and beaver ponds.',
    isMigratory: true,
    flyways: ['pacific', 'central', 'mississippi', 'atlantic'],
  },
  {
    slug: 'blue-winged-teal',
    name: 'Blue-winged Teal',
    scientificName: 'Spatula discors',
    category: 'waterfowl' as const,
    description: 'One of the earliest migrants in fall, heading to Central and South America. Special early September teal seasons are popular across the Central and Mississippi flyways.',
    habitat: 'Shallow wetlands, prairie potholes, and flooded fields.',
    isMigratory: true,
    flyways: ['central', 'mississippi', 'atlantic'],
  },
  {
    slug: 'pintail',
    name: 'Northern Pintail',
    scientificName: 'Anas acuta',
    category: 'waterfowl' as const,
    description: 'An elegant dabbling duck with a distinctive long tail. Populations have been below long-term averages, resulting in restrictive 1-bird bag limits in most flyways.',
    habitat: 'Open marshes, flooded agricultural fields, shallow lakes, and prairie wetlands.',
    isMigratory: true,
    flyways: ['pacific', 'central', 'mississippi', 'atlantic'],
  },
  {
    slug: 'wood-duck',
    name: 'Wood Duck',
    scientificName: 'Aix sponsa',
    category: 'waterfowl' as const,
    description: 'One of the most colorful North American waterfowl. Unique among ducks for nesting in tree cavities. A conservation success story after near-extinction in the early 1900s.',
    habitat: 'Wooded swamps, beaver ponds, forested river corridors, and bottomland hardwoods.',
    isMigratory: true,
    flyways: ['mississippi', 'atlantic', 'central'],
  },
]

// ============================================
// HELPER: look up IDs by code/slug
// ============================================

async function getStateId(code: string): Promise<string> {
  const rows = await db.select({ id: states.id }).from(states).where(eq(states.code, code))
  if (rows.length === 0) throw new Error(`State ${code} not found. Run seed.ts first.`)
  return rows[0].id
}

async function getSpeciesId(slug: string): Promise<string> {
  const rows = await db.select({ id: species.id }).from(species).where(eq(species.slug, slug))
  if (rows.length === 0) throw new Error(`Species ${slug} not found.`)
  return rows[0].id
}

// ============================================
// SEED REGULATIONS
// ============================================

async function seedRegulations() {
  console.log('\nSeeding waterfowl regulations...')

  const regs = [
    // TEXAS
    {
      stateCode: 'TX',
      category: 'waterfowl',
      title: 'Texas Duck Season - North Zone',
      content: 'The Texas North Zone duck season runs in two segments. First segment opens in late October for approximately 2 weeks, with the second segment running from mid-November through late January. Daily bag limit: 6 ducks, including no more than 5 mallards (2 hens), 3 wood ducks, 2 redheads, 2 scaup, 1 pintail, 1 canvasback, and 1 mottled duck. Shooting hours: one-half hour before sunrise to sunset.',
      summary: 'TX North Zone duck season: split season Oct-Jan. 6 duck daily bag limit with species restrictions. Shooting hours 30 min before sunrise to sunset.',
      sourceUrl: 'https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-birds',
    },
    {
      stateCode: 'TX',
      category: 'waterfowl',
      title: 'Texas Duck Season - South Zone',
      content: 'The Texas South Zone duck season runs in two segments. First segment opens in late October for approximately 2 weeks, with the second segment from early November through late January. Same bag limits as North Zone: 6 ducks per day. The South Zone includes the prime coastal marshes and rice prairies of the Gulf Coast, which hold the highest concentrations of wintering waterfowl in the Central Flyway.',
      summary: 'TX South Zone duck season: split season Oct-Jan. 6 duck daily bag limit. Covers Gulf Coast marshes and rice prairies.',
      sourceUrl: 'https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-birds',
    },
    {
      stateCode: 'TX',
      category: 'waterfowl',
      title: 'Texas Goose Season - Light Geese (Regular)',
      content: 'Regular light goose (snow, blue, and Ross\'s geese) season in the Western Goose Zone runs from late October through mid-February. Eastern Goose Zone runs from early November through mid-February. Daily bag limit: 20 light geese, no possession limit during the regular season. Light geese are abundant in the Texas Panhandle and along the Gulf Coast.',
      summary: 'TX regular light goose season: Oct/Nov-Feb. 20/day bag limit, no possession limit.',
      sourceUrl: 'https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-birds',
    },
    {
      stateCode: 'TX',
      category: 'waterfowl',
      title: 'Texas Light Goose Conservation Order',
      content: 'The Light Goose Conservation Order runs from the day after the regular goose season closes through late March. During conservation order: no bag or possession limit, electronic calls allowed, unplugged shotguns allowed (no 3-shell limit), shooting hours extended to one-half hour after sunset. The conservation order was established to reduce overabundant light goose populations that are destroying Arctic breeding habitat. Hunters must still have a valid hunting license and HIP certification.',
      summary: 'TX Light Goose Conservation Order: Feb-Mar. No bag/possession limits. E-calls and unplugged shotguns allowed. Extended shooting hours.',
      sourceUrl: 'https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-birds',
    },
    {
      stateCode: 'TX',
      category: 'waterfowl',
      title: 'Texas Dark Goose Season',
      content: 'Dark goose (Canada goose, white-fronted goose/specklebelly) season in the Western Goose Zone runs from late October through mid-February. Eastern Goose Zone runs from early November through late January. Daily bag limit: 5 dark geese, which may include no more than 3 white-fronted geese. White-fronted geese (specklebellies) are highly prized table fare.',
      summary: 'TX dark goose season: Oct/Nov-Feb. 5/day bag limit, max 3 white-fronted geese.',
      sourceUrl: 'https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-birds',
    },
    {
      stateCode: 'TX',
      category: 'waterfowl',
      title: 'Texas Early Teal Season',
      content: 'Texas early teal-only season runs for 16 days in September. Daily bag limit: 6 teal (any combination of blue-winged, green-winged, and cinnamon teal). Shooting hours: one-half hour before sunrise to sunset. This season targets early-migrating teal before the general duck season opens. A popular season along the Gulf Coast and in the rice prairies.',
      summary: 'TX early teal season: 16 days in September. 6 teal/day. 30 min before sunrise to sunset.',
      sourceUrl: 'https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-birds',
    },

    // ARKANSAS
    {
      stateCode: 'AR',
      category: 'waterfowl',
      title: 'Arkansas Duck Season',
      content: 'Arkansas duck season runs for 60 days in a split format, typically with 3 segments. The season generally runs from late November through late January. Daily bag limit: 6 ducks, including no more than 4 mallards (2 hens), 3 wood ducks, 2 redheads, 2 scaup, 1 pintail, 1 canvasback, and 1 mottled duck. Arkansas is part of the Mississippi Flyway and Stuttgart is known as the "Duck Capital of the World." Shooting hours: one-half hour before sunrise to sunset.',
      summary: 'AR duck season: 60 days Nov-Jan (3 segments). 6 ducks/day. Stuttgart is the "Duck Capital of the World."',
      sourceUrl: 'https://www.agfc.com/en/hunting/migratory-birds/waterfowl/',
    },
    {
      stateCode: 'AR',
      category: 'waterfowl',
      title: 'Arkansas Goose Season',
      content: 'Arkansas light goose (snow, blue, Ross\'s) regular season runs from early November through mid-February. Daily bag limit: 20 light geese, no possession limit. Dark goose (Canada goose, white-fronted goose) season runs similarly. Daily bag limit for dark geese: 3, with species-specific restrictions. White-fronted goose limit: 2 per day during certain periods.',
      summary: 'AR goose season: Nov-Feb. Light geese: 20/day, no possession limit. Dark geese: 3/day.',
      sourceUrl: 'https://www.agfc.com/en/hunting/migratory-birds/waterfowl/',
    },
    {
      stateCode: 'AR',
      category: 'waterfowl',
      title: 'Arkansas Light Goose Conservation Order',
      content: 'The Arkansas Light Goose Conservation Order runs from the day after the regular light goose season closes through late April. During conservation order: no bag or possession limit, electronic calls allowed, unplugged shotguns (no 3-shell limit), and shooting hours extended to one-half hour after sunset. Valid hunting license and HIP certification required.',
      summary: 'AR Conservation Order: Feb-Apr. No bag/possession limits. E-calls, unplugged shotguns, extended hours allowed.',
      sourceUrl: 'https://www.agfc.com/en/hunting/migratory-birds/waterfowl/',
    },

    // NEW MEXICO
    {
      stateCode: 'NM',
      category: 'waterfowl',
      title: 'New Mexico Duck Season',
      content: 'New Mexico duck season runs for approximately 97 days in the South Zone and 74-83 days in the North Zone, typically from mid-October through late January. Daily bag limit: 6 ducks with species restrictions including no more than 5 mallards (2 hens), 2 pintails (in some years 1), 2 redheads, 2 scaup, and 3 wood ducks. New Mexico is in the Central Flyway and offers excellent hunting along the Rio Grande corridor and at refuges like Bosque del Apache.',
      summary: 'NM duck season: Oct-Jan, 74-97 days depending on zone. 6 ducks/day. Rio Grande corridor and Bosque del Apache are top areas.',
      sourceUrl: 'https://www.wildlife.state.nm.us/hunting/waterfowl/',
    },
    {
      stateCode: 'NM',
      category: 'waterfowl',
      title: 'New Mexico Light Goose Conservation Order',
      content: 'The New Mexico Light Goose Conservation Order runs from the day after the regular goose season closes through mid-March. No bag or possession limits, electronic calls permitted, unplugged shotguns allowed. The Clovis and Portales areas of eastern New Mexico are major wintering grounds for snow geese, with concentrations of 100,000+ birds in peak years. Grulla NWR and surrounding agricultural fields are prime hunting areas.',
      summary: 'NM Conservation Order: Feb-Mar. No limits. Clovis/Portales area is a major snow goose wintering ground (100K+ birds).',
      sourceUrl: 'https://www.wildlife.state.nm.us/hunting/waterfowl/',
    },
    {
      stateCode: 'NM',
      category: 'waterfowl',
      title: 'New Mexico Goose Season - Regular',
      content: 'Regular goose season in New Mexico runs from late October through mid-February. Light geese (snow, Ross\'s, blue): daily bag limit of 20, no possession limit. Dark geese (Canada, white-fronted): daily bag limit of 5 in most zones, with species-specific restrictions. Shooting hours: one-half hour before sunrise to sunset.',
      summary: 'NM regular goose season: Oct-Feb. Light geese 20/day. Dark geese 5/day.',
      sourceUrl: 'https://www.wildlife.state.nm.us/hunting/waterfowl/',
    },

    // KANSAS
    {
      stateCode: 'KS',
      category: 'waterfowl',
      title: 'Kansas Duck Season',
      content: 'Kansas offers three duck hunting zones: High Plains, Early, and Late Zones with varying season dates. The season generally runs from early October through late January across zones, with a 74-97 day framework. Daily bag limit: 6 ducks with species restrictions. Kansas Cheyenne Bottoms and Quivira NWR are two of the most important wetland complexes in the Central Flyway.',
      summary: 'KS duck season: Oct-Jan across 3 zones. 6 ducks/day. Cheyenne Bottoms and Quivira NWR are premier areas.',
      sourceUrl: 'https://ksoutdoors.com/Hunting/Migratory-Birds/Waterfowl',
    },
    {
      stateCode: 'KS',
      category: 'waterfowl',
      title: 'Kansas Light Goose Conservation Order',
      content: 'The Kansas Light Goose Conservation Order runs from the day after the regular light goose season closes through late April. No bag or possession limits, electronic calls allowed, unplugged shotguns permitted, and extended shooting hours (to one-half hour after sunset). Kansas receives significant numbers of snow and Ross\'s geese during spring migration through the Central Flyway.',
      summary: 'KS Conservation Order: Feb-Apr. No limits. E-calls and unplugged shotguns allowed.',
      sourceUrl: 'https://ksoutdoors.com/Hunting/Migratory-Birds/Waterfowl',
    },

    // OKLAHOMA
    {
      stateCode: 'OK',
      category: 'waterfowl',
      title: 'Oklahoma Duck Season',
      content: 'Oklahoma duck season runs in a split format across two zones (Zone 1 and Zone 2). The season typically runs from late October through late January for approximately 74-97 days. Daily bag limit: 6 ducks with standard Central Flyway species restrictions. Oklahoma\'s prime waterfowl areas include the Great Salt Plains, Salt Fork of the Arkansas River, and numerous WMAs in the western part of the state.',
      summary: 'OK duck season: Oct-Jan, split format, 2 zones. 6 ducks/day. Great Salt Plains and Salt Fork are key areas.',
      sourceUrl: 'https://www.wildlifedepartment.com/hunting/migratory-birds',
    },
    {
      stateCode: 'OK',
      category: 'waterfowl',
      title: 'Oklahoma Light Goose Conservation Order',
      content: 'The Oklahoma Light Goose Conservation Order runs from the day after the regular light goose season closes through late March or early April. No bag or possession limits, electronic calls allowed, unplugged shotguns allowed, extended shooting hours. Oklahoma receives large flights of light geese migrating through the Central Flyway.',
      summary: 'OK Conservation Order: Feb-Apr. No limits. E-calls and unplugged shotguns allowed.',
      sourceUrl: 'https://www.wildlifedepartment.com/hunting/migratory-birds',
    },

    // LOUISIANA
    {
      stateCode: 'LA',
      category: 'waterfowl',
      title: 'Louisiana Duck Season',
      content: 'Louisiana offers three duck hunting zones: West Zone, East Zone, and Coastal Zone. The season runs in a split format with 60 days total, typically from early November through late January. Daily bag limit: 6 ducks with Mississippi Flyway species restrictions, including no more than 4 mallards (2 hens), 3 wood ducks, 2 scaup, 2 redheads, 1 pintail, 1 canvasback, and 1 mottled duck. Louisiana\'s coastal marshes are among the most productive wintering waterfowl habitat in North America.',
      summary: 'LA duck season: 60 days Nov-Jan, 3 zones. 6 ducks/day. Coastal marshes are premier wintering waterfowl habitat.',
      sourceUrl: 'https://www.wlf.louisiana.gov/page/waterfowl-seasons',
    },
    {
      stateCode: 'LA',
      category: 'waterfowl',
      title: 'Louisiana Goose Season',
      content: 'Louisiana regular light goose season runs from early November through mid-February. Daily bag limit: 20 light geese, no possession limit. Dark goose (Canada and white-fronted) season runs similarly with a daily bag limit of 3. Louisiana offers some of the finest goose hunting in the Mississippi Flyway, particularly along the coast and in southwest Louisiana rice country.',
      summary: 'LA goose season: Nov-Feb. Light geese 20/day. Dark geese 3/day. SW Louisiana rice country is prime territory.',
      sourceUrl: 'https://www.wlf.louisiana.gov/page/waterfowl-seasons',
    },
    {
      stateCode: 'LA',
      category: 'waterfowl',
      title: 'Louisiana Light Goose Conservation Order',
      content: 'The Louisiana Light Goose Conservation Order runs from the day after the regular light goose season closes through late March. No bag or possession limits, electronic calls allowed, unplugged shotguns allowed, extended shooting hours to one-half hour after sunset. Southwest Louisiana is a major staging area for spring-migrating snow geese.',
      summary: 'LA Conservation Order: Feb-Mar. No limits. E-calls, unplugged shotguns, extended hours allowed.',
      sourceUrl: 'https://www.wlf.louisiana.gov/page/waterfowl-seasons',
    },
  ]

  for (const reg of regs) {
    const stateId = await getStateId(reg.stateCode)
    // Find species ID based on title content
    let speciesId: string | null = null
    const titleLower = reg.title.toLowerCase()
    if (titleLower.includes('duck') || titleLower.includes('teal')) {
      speciesId = await getSpeciesId('mallard').catch(() => null)
    } else if (titleLower.includes('light goose') || titleLower.includes('conservation order') || titleLower.includes('snow')) {
      speciesId = await getSpeciesId('snow-goose').catch(() => null)
    } else if (titleLower.includes('dark goose')) {
      speciesId = await getSpeciesId('canada-goose').catch(() => null)
    }

    await db.insert(regulations).values({
      stateId,
      speciesId,
      category: reg.category,
      title: reg.title,
      content: reg.content,
      summary: reg.summary,
      seasonYear: 2024,
      sourceUrl: reg.sourceUrl,
      sourceDocument: null,
      isActive: true,
      metadata: { flyway: reg.stateCode === 'AR' || reg.stateCode === 'LA' ? 'mississippi' : 'central' },
    }).onConflictDoNothing()

    console.log(`  [${reg.stateCode}] ${reg.title}`)
  }
}

// ============================================
// SEED SEASONS
// ============================================

async function seedSeasons() {
  console.log('\nSeeding waterfowl seasons...')

  const seasonData = [
    // TEXAS
    { stateCode: 'TX', speciesSlug: 'mallard', name: 'Early Teal Season', seasonType: 'teal', startDate: '2024-09-14', endDate: '2024-09-29', bagLimit: { daily: 6, possession: 18 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Teal only (blue-winged, green-winged, cinnamon)' },
    { stateCode: 'TX', speciesSlug: 'mallard', name: 'Duck Season - North Zone', seasonType: 'general', startDate: '2024-10-26', endDate: '2025-01-26', bagLimit: { daily: 6, possession: 18 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Split season. Species restrictions: max 5 mallards (2 hens), 3 wood ducks, 2 redheads, 2 scaup, 1 pintail, 1 canvasback' },
    { stateCode: 'TX', speciesSlug: 'mallard', name: 'Duck Season - South Zone', seasonType: 'general', startDate: '2024-10-26', endDate: '2025-01-26', bagLimit: { daily: 6, possession: 18 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Split season. Same species restrictions as North Zone.' },
    { stateCode: 'TX', speciesSlug: 'snow-goose', name: 'Light Goose Regular Season', seasonType: 'general', startDate: '2024-10-26', endDate: '2025-02-09', bagLimit: { daily: 20 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Snow, blue, and Ross\'s geese. No possession limit.' },
    { stateCode: 'TX', speciesSlug: 'snow-goose', name: 'Light Goose Conservation Order', seasonType: 'conservation-order', startDate: '2025-02-10', endDate: '2025-03-23', bagLimit: { daily: null, season: null }, shootingHours: { start: '30 min before sunrise', end: '30 min after sunset' }, restrictions: 'No bag or possession limit. Electronic calls allowed. Unplugged shotguns allowed.' },
    { stateCode: 'TX', speciesSlug: 'canada-goose', name: 'Dark Goose Season', seasonType: 'general', startDate: '2024-10-26', endDate: '2025-02-09', bagLimit: { daily: 5 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Canada and white-fronted geese. Max 3 white-fronted geese per day.' },

    // ARKANSAS
    { stateCode: 'AR', speciesSlug: 'mallard', name: 'Duck Season', seasonType: 'general', startDate: '2024-11-23', endDate: '2025-01-31', bagLimit: { daily: 6, possession: 18 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: '60 days, 3 segments. Max 4 mallards (2 hens), 3 wood ducks, 2 scaup, 2 redheads, 1 pintail, 1 canvasback.' },
    { stateCode: 'AR', speciesSlug: 'snow-goose', name: 'Light Goose Regular Season', seasonType: 'general', startDate: '2024-11-02', endDate: '2025-02-16', bagLimit: { daily: 20 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Snow, blue, and Ross\'s geese. No possession limit.' },
    { stateCode: 'AR', speciesSlug: 'snow-goose', name: 'Light Goose Conservation Order', seasonType: 'conservation-order', startDate: '2025-02-17', endDate: '2025-04-30', bagLimit: { daily: null, season: null }, shootingHours: { start: '30 min before sunrise', end: '30 min after sunset' }, restrictions: 'No bag/possession limit. E-calls allowed. Unplugged shotguns. Extended hours.' },
    { stateCode: 'AR', speciesSlug: 'canada-goose', name: 'Dark Goose Season', seasonType: 'general', startDate: '2024-11-02', endDate: '2025-02-16', bagLimit: { daily: 3 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Canada and white-fronted geese. Species-specific sub-limits may apply.' },

    // NEW MEXICO
    { stateCode: 'NM', speciesSlug: 'mallard', name: 'Duck Season - South Zone', seasonType: 'general', startDate: '2024-10-12', endDate: '2025-01-31', bagLimit: { daily: 6, possession: 18 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: '97 days. Standard Central Flyway species restrictions.' },
    { stateCode: 'NM', speciesSlug: 'snow-goose', name: 'Light Goose Regular Season', seasonType: 'general', startDate: '2024-10-26', endDate: '2025-02-09', bagLimit: { daily: 20 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Snow, blue, and Ross\'s geese. No possession limit.' },
    { stateCode: 'NM', speciesSlug: 'snow-goose', name: 'Light Goose Conservation Order', seasonType: 'conservation-order', startDate: '2025-02-10', endDate: '2025-03-15', bagLimit: { daily: null, season: null }, shootingHours: { start: '30 min before sunrise', end: '30 min after sunset' }, restrictions: 'No limits. E-calls and unplugged shotguns allowed. Clovis/Portales area is prime territory.' },

    // KANSAS
    { stateCode: 'KS', speciesSlug: 'mallard', name: 'Duck Season - Late Zone', seasonType: 'general', startDate: '2024-10-12', endDate: '2025-01-26', bagLimit: { daily: 6, possession: 18 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Standard Central Flyway species restrictions.' },
    { stateCode: 'KS', speciesSlug: 'snow-goose', name: 'Light Goose Conservation Order', seasonType: 'conservation-order', startDate: '2025-02-10', endDate: '2025-04-30', bagLimit: { daily: null, season: null }, shootingHours: { start: '30 min before sunrise', end: '30 min after sunset' }, restrictions: 'No limits. E-calls and unplugged shotguns allowed.' },

    // OKLAHOMA
    { stateCode: 'OK', speciesSlug: 'mallard', name: 'Duck Season', seasonType: 'general', startDate: '2024-10-26', endDate: '2025-01-31', bagLimit: { daily: 6, possession: 18 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Split season, 2 zones. Standard Central Flyway species restrictions.' },
    { stateCode: 'OK', speciesSlug: 'snow-goose', name: 'Light Goose Conservation Order', seasonType: 'conservation-order', startDate: '2025-02-10', endDate: '2025-03-31', bagLimit: { daily: null, season: null }, shootingHours: { start: '30 min before sunrise', end: '30 min after sunset' }, restrictions: 'No limits. E-calls and unplugged shotguns allowed.' },

    // LOUISIANA
    { stateCode: 'LA', speciesSlug: 'mallard', name: 'Duck Season - West Zone', seasonType: 'general', startDate: '2024-11-09', endDate: '2025-01-26', bagLimit: { daily: 6, possession: 18 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: '60 days, split season. Mississippi Flyway species restrictions.' },
    { stateCode: 'LA', speciesSlug: 'snow-goose', name: 'Light Goose Regular Season', seasonType: 'general', startDate: '2024-11-02', endDate: '2025-02-16', bagLimit: { daily: 20 }, shootingHours: { start: '30 min before sunrise', end: 'sunset' }, restrictions: 'Snow, blue, and Ross\'s geese. No possession limit.' },
    { stateCode: 'LA', speciesSlug: 'snow-goose', name: 'Light Goose Conservation Order', seasonType: 'conservation-order', startDate: '2025-02-17', endDate: '2025-03-31', bagLimit: { daily: null, season: null }, shootingHours: { start: '30 min before sunrise', end: '30 min after sunset' }, restrictions: 'No limits. E-calls and unplugged shotguns allowed. SW Louisiana rice country is prime.' },
  ]

  for (const s of seasonData) {
    const stateId = await getStateId(s.stateCode)
    const speciesId = await getSpeciesId(s.speciesSlug)

    await db.insert(seasons).values({
      stateId,
      speciesId,
      name: s.name,
      seasonType: s.seasonType,
      startDate: new Date(s.startDate),
      endDate: new Date(s.endDate),
      year: 2024,
      bagLimit: s.bagLimit,
      shootingHours: s.shootingHours,
      restrictions: s.restrictions,
      sourceUrl: null,
    }).onConflictDoNothing()

    console.log(`  [${s.stateCode}] ${s.name}: ${s.startDate} to ${s.endDate}`)
  }
}

// ============================================
// SEED LICENSES
// ============================================

async function seedLicenses() {
  console.log('\nSeeding waterfowl license requirements...')

  const licenseData = [
    // TEXAS
    { stateCode: 'TX', name: 'Resident Hunting License', licenseType: 'base', description: 'Required for all Texas residents to hunt any species.', isResidentOnly: true, priceResident: 25, priceNonResident: null, validFor: ['all'], purchaseUrl: 'https://tpwd.texas.gov/business/licenses' },
    { stateCode: 'TX', name: 'Non-Resident Hunting License', licenseType: 'base', description: 'Required for all non-residents to hunt in Texas. Includes all game animals and game birds.', isResidentOnly: false, priceResident: null, priceNonResident: 315, validFor: ['all'], purchaseUrl: 'https://tpwd.texas.gov/business/licenses' },
    { stateCode: 'TX', name: 'Migratory Game Bird Stamp', licenseType: 'stamp', description: 'Required in addition to hunting license for all migratory bird hunting, including waterfowl and doves.', isResidentOnly: false, priceResident: 7, priceNonResident: 7, validFor: ['waterfowl', 'migratory'], purchaseUrl: 'https://tpwd.texas.gov/business/licenses' },
    { stateCode: 'TX', name: 'Federal Duck Stamp', licenseType: 'stamp', description: 'Federal Migratory Bird Hunting and Conservation Stamp. Required for all waterfowl hunters age 16+. Must be signed across the face.', isResidentOnly: false, priceResident: 25, priceNonResident: 25, validFor: ['waterfowl'], purchaseUrl: 'https://www.fws.gov/service/federal-duck-stamps' },
    { stateCode: 'TX', name: 'HIP Certification', licenseType: 'permit', description: 'Harvest Information Program certification. Required for all migratory bird hunters. Free, obtained during license purchase.', isResidentOnly: false, priceResident: 0, priceNonResident: 0, validFor: ['waterfowl', 'migratory'], purchaseUrl: 'https://tpwd.texas.gov/business/licenses' },

    // ARKANSAS
    { stateCode: 'AR', name: 'Resident Hunting License', licenseType: 'base', description: 'Required for all Arkansas residents to hunt.', isResidentOnly: true, priceResident: 10.50, priceNonResident: null, validFor: ['all'], purchaseUrl: 'https://www.agfc.com/en/licensing/' },
    { stateCode: 'AR', name: 'Non-Resident All Game Hunting License', licenseType: 'base', description: 'Required for non-residents to hunt all game in Arkansas.', isResidentOnly: false, priceResident: null, priceNonResident: 350, validFor: ['all'], purchaseUrl: 'https://www.agfc.com/en/licensing/' },
    { stateCode: 'AR', name: 'State Waterfowl Stamp', licenseType: 'stamp', description: 'Required for waterfowl hunting in Arkansas, in addition to hunting license.', isResidentOnly: false, priceResident: 7, priceNonResident: 7, validFor: ['waterfowl'], purchaseUrl: 'https://www.agfc.com/en/licensing/' },
    { stateCode: 'AR', name: 'Federal Duck Stamp', licenseType: 'stamp', description: 'Federal Migratory Bird Hunting and Conservation Stamp. Required for all waterfowl hunters age 16+.', isResidentOnly: false, priceResident: 25, priceNonResident: 25, validFor: ['waterfowl'], purchaseUrl: 'https://www.fws.gov/service/federal-duck-stamps' },
    { stateCode: 'AR', name: 'HIP Certification', licenseType: 'permit', description: 'Harvest Information Program. Required for migratory bird hunting. Free.', isResidentOnly: false, priceResident: 0, priceNonResident: 0, validFor: ['waterfowl', 'migratory'], purchaseUrl: 'https://www.agfc.com/en/licensing/' },

    // NEW MEXICO
    { stateCode: 'NM', name: 'Resident Small Game License', licenseType: 'base', description: 'Required for New Mexico residents to hunt small game including waterfowl.', isResidentOnly: true, priceResident: 15, priceNonResident: null, validFor: ['small-game', 'waterfowl', 'migratory'], purchaseUrl: 'https://onlinesales.wildlife.state.nm.us' },
    { stateCode: 'NM', name: 'Non-Resident Small Game License', licenseType: 'base', description: 'Required for non-residents to hunt small game and waterfowl in New Mexico.', isResidentOnly: false, priceResident: null, priceNonResident: 93, validFor: ['small-game', 'waterfowl', 'migratory'], purchaseUrl: 'https://onlinesales.wildlife.state.nm.us' },
    { stateCode: 'NM', name: 'Migratory Waterfowl Stamp', licenseType: 'stamp', description: 'Required for waterfowl hunting in New Mexico.', isResidentOnly: false, priceResident: 5, priceNonResident: 5, validFor: ['waterfowl'], purchaseUrl: 'https://onlinesales.wildlife.state.nm.us' },
    { stateCode: 'NM', name: 'Federal Duck Stamp', licenseType: 'stamp', description: 'Federal Migratory Bird Hunting and Conservation Stamp. Required for all waterfowl hunters age 16+.', isResidentOnly: false, priceResident: 25, priceNonResident: 25, validFor: ['waterfowl'], purchaseUrl: 'https://www.fws.gov/service/federal-duck-stamps' },
    { stateCode: 'NM', name: 'HIP Certification', licenseType: 'permit', description: 'Harvest Information Program. Required for migratory bird hunting. Free.', isResidentOnly: false, priceResident: 0, priceNonResident: 0, validFor: ['waterfowl', 'migratory'], purchaseUrl: 'https://onlinesales.wildlife.state.nm.us' },

    // KANSAS
    { stateCode: 'KS', name: 'Resident Hunting License', licenseType: 'base', description: 'Required for all Kansas residents to hunt.', isResidentOnly: true, priceResident: 27.50, priceNonResident: null, validFor: ['all'], purchaseUrl: 'https://ksoutdoors.com/License-Permits' },
    { stateCode: 'KS', name: 'Non-Resident Hunting License', licenseType: 'base', description: 'Required for non-residents to hunt in Kansas.', isResidentOnly: false, priceResident: null, priceNonResident: 97.50, validFor: ['all'], purchaseUrl: 'https://ksoutdoors.com/License-Permits' },
    { stateCode: 'KS', name: 'State Waterfowl Stamp', licenseType: 'stamp', description: 'Kansas waterfowl habitat stamp. Required for waterfowl hunting.', isResidentOnly: false, priceResident: 8, priceNonResident: 8, validFor: ['waterfowl'], purchaseUrl: 'https://ksoutdoors.com/License-Permits' },
    { stateCode: 'KS', name: 'Federal Duck Stamp', licenseType: 'stamp', description: 'Federal Migratory Bird Hunting and Conservation Stamp. Required for waterfowl hunters age 16+.', isResidentOnly: false, priceResident: 25, priceNonResident: 25, validFor: ['waterfowl'], purchaseUrl: 'https://www.fws.gov/service/federal-duck-stamps' },
    { stateCode: 'KS', name: 'HIP Certification', licenseType: 'permit', description: 'Harvest Information Program. Required for migratory bird hunting. Free.', isResidentOnly: false, priceResident: 0, priceNonResident: 0, validFor: ['waterfowl', 'migratory'], purchaseUrl: 'https://ksoutdoors.com/License-Permits' },

    // OKLAHOMA
    { stateCode: 'OK', name: 'Resident Hunting License', licenseType: 'base', description: 'Required for all Oklahoma residents to hunt.', isResidentOnly: true, priceResident: 25, priceNonResident: null, validFor: ['all'], purchaseUrl: 'https://www.wildlifedepartment.com/licensing' },
    { stateCode: 'OK', name: 'Non-Resident Hunting License', licenseType: 'base', description: 'Required for non-residents to hunt in Oklahoma.', isResidentOnly: false, priceResident: null, priceNonResident: 215, validFor: ['all'], purchaseUrl: 'https://www.wildlifedepartment.com/licensing' },
    { stateCode: 'OK', name: 'State Waterfowl Stamp', licenseType: 'stamp', description: 'Oklahoma waterfowl stamp. Required for waterfowl hunting.', isResidentOnly: false, priceResident: 4, priceNonResident: 4, validFor: ['waterfowl'], purchaseUrl: 'https://www.wildlifedepartment.com/licensing' },
    { stateCode: 'OK', name: 'Federal Duck Stamp', licenseType: 'stamp', description: 'Federal Migratory Bird Hunting and Conservation Stamp. Required for waterfowl hunters age 16+.', isResidentOnly: false, priceResident: 25, priceNonResident: 25, validFor: ['waterfowl'], purchaseUrl: 'https://www.fws.gov/service/federal-duck-stamps' },
    { stateCode: 'OK', name: 'HIP Certification', licenseType: 'permit', description: 'Harvest Information Program. Required for migratory bird hunting. Free.', isResidentOnly: false, priceResident: 0, priceNonResident: 0, validFor: ['waterfowl', 'migratory'], purchaseUrl: 'https://www.wildlifedepartment.com/licensing' },

    // LOUISIANA
    { stateCode: 'LA', name: 'Resident Basic Hunting License', licenseType: 'base', description: 'Required for all Louisiana residents to hunt.', isResidentOnly: true, priceResident: 15, priceNonResident: null, validFor: ['all'], purchaseUrl: 'https://www.wlf.louisiana.gov/page/purchase-a-license' },
    { stateCode: 'LA', name: 'Non-Resident All Game Hunting License', licenseType: 'base', description: 'Required for non-residents to hunt all game in Louisiana.', isResidentOnly: false, priceResident: null, priceNonResident: 150, validFor: ['all'], purchaseUrl: 'https://www.wlf.louisiana.gov/page/purchase-a-license' },
    { stateCode: 'LA', name: 'State Duck Stamp', licenseType: 'stamp', description: 'Louisiana waterfowl conservation stamp. Required for waterfowl hunting.', isResidentOnly: false, priceResident: 5.50, priceNonResident: 25, validFor: ['waterfowl'], purchaseUrl: 'https://www.wlf.louisiana.gov/page/purchase-a-license' },
    { stateCode: 'LA', name: 'Federal Duck Stamp', licenseType: 'stamp', description: 'Federal Migratory Bird Hunting and Conservation Stamp. Required for waterfowl hunters age 16+.', isResidentOnly: false, priceResident: 25, priceNonResident: 25, validFor: ['waterfowl'], purchaseUrl: 'https://www.fws.gov/service/federal-duck-stamps' },
    { stateCode: 'LA', name: 'HIP Certification', licenseType: 'permit', description: 'Harvest Information Program. Required for migratory bird hunting. Free.', isResidentOnly: false, priceResident: 0, priceNonResident: 0, validFor: ['waterfowl', 'migratory'], purchaseUrl: 'https://www.wlf.louisiana.gov/page/purchase-a-license' },
  ]

  for (const lic of licenseData) {
    const stateId = await getStateId(lic.stateCode)

    await db.insert(licenses).values({
      stateId,
      name: lic.name,
      licenseType: lic.licenseType,
      description: lic.description,
      isResidentOnly: lic.isResidentOnly,
      priceResident: lic.priceResident,
      priceNonResident: lic.priceNonResident,
      validFor: lic.validFor,
      purchaseUrl: lic.purchaseUrl,
    }).onConflictDoNothing()

    console.log(`  [${lic.stateCode}] ${lic.name}${lic.priceResident != null ? ` - R:$${lic.priceResident}` : ''}${lic.priceNonResident != null ? ` NR:$${lic.priceNonResident}` : ''}`)
  }
}

// ============================================
// MAIN
// ============================================

async function seedWaterfowl() {
  console.log('=== HuntStack V1 Waterfowl Seed ===\n')
  console.log('NOTE: Dates/prices based on 2024-2025 season frameworks.')
  console.log('Verify against official state sources before each season.\n')

  // 1. Add missing V1 priority states
  console.log('Adding V1 priority states...')
  const insertedStates = await db
    .insert(states)
    .values(newStates)
    .onConflictDoNothing({ target: states.code })
    .returning()

  for (const s of insertedStates) {
    console.log(`  ${s.code} - ${s.name} (${s.agencyName})`)
  }
  if (insertedStates.length === 0) {
    console.log('  (all states already exist)')
  }

  // 2. Add waterfowl species
  console.log('\nAdding waterfowl species...')
  const insertedSpecies = await db
    .insert(species)
    .values(newSpecies)
    .onConflictDoNothing({ target: species.slug })
    .returning()

  for (const sp of insertedSpecies) {
    console.log(`  ${sp.slug} [${sp.category}] - ${sp.name}`)
  }
  if (insertedSpecies.length === 0) {
    console.log('  (all species already exist)')
  }

  // 3. Seed regulations
  await seedRegulations()

  // 4. Seed seasons
  await seedSeasons()

  // 5. Seed licenses
  await seedLicenses()

  console.log('\n=== Waterfowl seed complete! ===')
}

seedWaterfowl()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => {
    client.end()
  })
