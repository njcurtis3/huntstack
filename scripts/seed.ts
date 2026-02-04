import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import 'dotenv/config'
import { states, species } from '../packages/db/src/schema/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

const stateData = [
  {
    code: 'CO',
    name: 'Colorado',
    agencyName: 'Colorado Parks and Wildlife',
    agencyUrl: 'https://cpw.state.co.us',
    regulationsUrl: 'https://cpw.state.co.us/learn/Pages/Regulations.aspx',
    licenseUrl: 'https://cpw.state.co.us/buyapply/Pages/Hunting.aspx',
  },
  {
    code: 'MT',
    name: 'Montana',
    agencyName: 'Montana Fish, Wildlife & Parks',
    agencyUrl: 'https://fwp.mt.gov',
    regulationsUrl: 'https://fwp.mt.gov/hunt/regulations',
    licenseUrl: 'https://fwp.mt.gov/buyapply',
  },
  {
    code: 'WY',
    name: 'Wyoming',
    agencyName: 'Wyoming Game and Fish Department',
    agencyUrl: 'https://wgfd.wyo.gov',
    regulationsUrl: 'https://wgfd.wyo.gov/Regulations',
    licenseUrl: 'https://wgfd.wyo.gov/Apply-or-Buy',
  },
  {
    code: 'TX',
    name: 'Texas',
    agencyName: 'Texas Parks and Wildlife Department',
    agencyUrl: 'https://tpwd.texas.gov',
    regulationsUrl: 'https://tpwd.texas.gov/regulations/outdoor-annual',
    licenseUrl: 'https://tpwd.texas.gov/business/licenses/retail-licenses/hunting',
  },
  {
    code: 'AR',
    name: 'Arkansas',
    agencyName: 'Arkansas Game and Fish Commission',
    agencyUrl: 'https://www.agfc.com',
    regulationsUrl: 'https://www.agfc.com/en/hunting/regulations/',
    licenseUrl: 'https://www.agfc.com/en/licensing/',
  },
]

const speciesData = [
  {
    slug: 'elk',
    name: 'Elk',
    scientificName: 'Cervus canadensis',
    category: 'big-game' as const,
    description: 'North American elk, one of the largest species within the deer family. Found primarily in western states with significant herds in Colorado, Montana, and Wyoming.',
    habitat: 'Mountain meadows, alpine forests, and grasslands between 6,000-10,000 feet elevation.',
    isMigratory: false,
  },
  {
    slug: 'mule-deer',
    name: 'Mule Deer',
    scientificName: 'Odocoileus hemionus',
    category: 'big-game' as const,
    description: 'Named for their large, mule-like ears. Native to western North America and a staple big game species across the Rocky Mountain states.',
    habitat: 'Sagebrush steppe, open conifer forests, and desert shrublands in western states.',
    isMigratory: false,
  },
  {
    slug: 'whitetail-deer',
    name: 'White-tailed Deer',
    scientificName: 'Odocoileus virginianus',
    category: 'big-game' as const,
    description: 'The most widely distributed and hunted big game animal in North America, found in every state except Alaska and Hawaii.',
    habitat: 'Hardwood forests, agricultural edges, river bottoms, and brushy areas.',
    isMigratory: false,
  },
  {
    slug: 'pronghorn',
    name: 'Pronghorn',
    scientificName: 'Antilocapra americana',
    category: 'big-game' as const,
    description: 'The fastest land animal in North America, capable of speeds up to 55 mph. Found in open plains and grasslands of the western US.',
    habitat: 'Open prairies, sagebrush flats, and grasslands with minimal tree cover.',
    isMigratory: false,
  },
  {
    slug: 'black-bear',
    name: 'Black Bear',
    scientificName: 'Ursus americanus',
    category: 'big-game' as const,
    description: 'The most common and widely distributed bear species in North America. Hunted in many western and eastern states with spring and fall seasons.',
    habitat: 'Dense forests, swamps, and mountainous areas with thick vegetation cover.',
    isMigratory: false,
  },
  {
    slug: 'mallard',
    name: 'Mallard',
    scientificName: 'Anas platyrhynchos',
    category: 'waterfowl' as const,
    description: 'The most abundant and widely hunted duck in North America. A dabbling duck found in all four flyways, with the highest concentrations in the Central and Mississippi flyways.',
    habitat: 'Freshwater marshes, lakes, rivers, flooded agricultural fields, and coastal estuaries.',
    isMigratory: true,
    flyways: ['pacific', 'central', 'mississippi', 'atlantic'],
  },
  {
    slug: 'canada-goose',
    name: 'Canada Goose',
    scientificName: 'Branta canadensis',
    category: 'waterfowl' as const,
    description: 'One of the most recognizable waterfowl in North America. Both migratory and resident populations exist, with special seasons for resident birds in many states.',
    habitat: 'Agricultural fields, lakes, rivers, parks, and coastal marshes.',
    isMigratory: true,
    flyways: ['pacific', 'central', 'mississippi', 'atlantic'],
  },
  {
    slug: 'wild-turkey',
    name: 'Wild Turkey',
    scientificName: 'Meleagris gallopavo',
    category: 'upland' as const,
    description: 'A large upland game bird native to North America. Hunted in both spring (toms only) and fall seasons across most of the US.',
    habitat: 'Mixed hardwood and pine forests, forest edges, and agricultural clearings.',
    isMigratory: false,
  },
  {
    slug: 'ring-necked-pheasant',
    name: 'Ring-necked Pheasant',
    scientificName: 'Phasianus colchicus',
    category: 'upland' as const,
    description: 'An introduced upland game bird and the most popular upland species in the US. South Dakota is the top pheasant hunting destination in the country.',
    habitat: 'Agricultural grasslands, CRP fields, shelterbelts, and wetland edges in the Great Plains.',
    isMigratory: false,
  },
  {
    slug: 'northern-bobwhite-quail',
    name: 'Northern Bobwhite Quail',
    scientificName: 'Colinus virginianus',
    category: 'upland' as const,
    description: 'A small upland game bird named for its distinctive "bob-white" call. Populations have declined significantly but remain huntable in southern and central states.',
    habitat: 'Native grasslands, brushy pastures, pine savannas, and agricultural field edges.',
    isMigratory: false,
  },
]

async function seed() {
  console.log('Seeding database...\n')

  // Insert states
  console.log('Inserting states...')
  const insertedStates = await db
    .insert(states)
    .values(stateData)
    .onConflictDoNothing({ target: states.code })
    .returning()

  for (const s of insertedStates) {
    console.log(`  ${s.code} - ${s.name} (${s.agencyName})`)
  }

  // Insert species
  console.log('\nInserting species...')
  const insertedSpecies = await db
    .insert(species)
    .values(speciesData)
    .onConflictDoNothing({ target: species.slug })
    .returning()

  for (const sp of insertedSpecies) {
    console.log(`  ${sp.slug} [${sp.category}] - ${sp.name} (${sp.scientificName})`)
  }

  console.log(`\nDone! Inserted ${insertedStates.length} states and ${insertedSpecies.length} species.`)
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => {
    client.end()
  })
