import { FastifyPluginAsync } from 'fastify'

// -------------------------------------------------------
// Real verified outfitter data — manually curated
// TX populated. Other states pending.
// -------------------------------------------------------
const OUTFITTERS = [
  // TEXAS — waterfowl focus
  {
    id: 'tx-01',
    name: 'Top Gun Outfitters',
    slug: 'top-gun-outfitters',
    city: 'Goree',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Mallard', 'Pintail', 'Wigeon', 'Gadwall', 'Teal', 'Specklebelly', 'Snow Goose', 'Canada Goose', 'Sandhill Crane', 'Dove'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Premier North Texas waterfowl outfitter with access to 80,000+ acres across 8 counties. Known for specklebelly goose and playa lake duck hunts. 4,250 sq ft lodge with meals included.',
    website: 'https://topgunoutfitters.com',
    phone: '(806) 701-8065',
    isVerified: true,
  },
  {
    id: 'tx-02',
    name: 'Longneck Outfitters',
    slug: 'longneck-outfitters',
    city: 'Lubbock',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Sandhill Crane', 'Snow Goose', 'Canada Goose', 'Mallard', 'Teal', 'Dove'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Over two decades of waterfowl and crane guiding in the Texas Panhandle. Specializes in sandhill crane and goose hunts December through mid-March.',
    website: 'https://longneckoutfitters.com',
    phone: '(806) 642-1885',
    isVerified: true,
  },
  {
    id: 'tx-03',
    name: 'Caprock Waterfowl Outfitters',
    slug: 'caprock-waterfowl-outfitters',
    city: 'Tahoka',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Mallard', 'Pintail', 'Teal', 'Canada Goose', 'Snow Goose', 'Sandhill Crane', 'Dove'],
    huntTypes: ['guided'],
    priceRange: '$$',
    priceNote: '$300/day (without lodging), $350/day (with lodging)',
    rating: null,
    reviewCount: 0,
    description: 'Veteran-owned operation in the Texas Panhandle. One of the few outfitters with published day-rate pricing. Long seasons with no splits.',
    website: 'https://caprockwaterfowloutfitters.com',
    phone: '(940) 293-3737',
    isVerified: true,
  },
  {
    id: 'tx-04',
    name: 'Waterfowl Outfitters Unlimited',
    slug: 'waterfowl-outfitters-unlimited',
    city: 'Eagle Lake',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Snow Goose', 'Specklebelly', 'Canada Goose', 'Mallard', 'Pintail', 'Teal'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: "Located in the Goose Hunting Capital of the World. Rice field and flooded pond hunts with hundreds of thousands of geese roosting nightly. Guides, decoys, dogs, and white parkas provided.",
    website: 'https://waterfowloutfittersunlimited.com',
    phone: '(832) 361-0868',
    isVerified: true,
  },
  {
    id: 'tx-05',
    name: 'Waterfowl Specialties Inc.',
    slug: 'waterfowl-specialties',
    city: 'El Campo',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Mallard', 'Pintail', 'Teal', 'Gadwall', 'Canada Goose', 'Dove', 'Sandhill Crane'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Family-operated outfitter established in 1984. Located in the Texas Rice Belt 40 miles from the Gulf Coast. Over 40 years of continuous operation serving individuals, families, and corporate groups.',
    website: 'https://waterfowlspecialties.com',
    phone: '(979) 543-1109',
    isVerified: true,
  },
  {
    id: 'tx-06',
    name: 'Tule Creek Outfitters',
    slug: 'tule-creek-outfitters',
    city: 'Tulia',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Pheasant', 'Quail', 'Dove', 'Mallard', 'Canada Goose', 'Sandhill Crane'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: '$600-$2,700/person depending on package',
    rating: null,
    reviewCount: 0,
    description: 'Panhandle outfitter with full lodge accommodations. Upland and waterfowl combination hunts across cultivated cropland, shelterbelts, and CRP land. Partners with Sitka, Orvis, and Browning.',
    website: 'https://tulecreek.com',
    phone: '(806) 441-4868',
    isVerified: true,
  },
  {
    id: 'tx-07',
    name: 'Texas Fowl Outfitters',
    slug: 'texas-fowl-outfitters',
    city: 'Dodd City',
    state: 'TX',
    statesServed: ['TX', 'OK'],
    speciesOffered: ['Mallard', 'Pintail', 'Teal', 'Wigeon', 'Gadwall', 'Canvasback', 'Redhead', 'Snow Goose', 'Canada Goose', 'Whitetail Deer', 'Wild Hog'],
    huntTypes: ['guided'],
    priceRange: '$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Family-oriented outfitter with 15+ years guiding waterfowl in North Texas and Southern Oklahoma. Broad multi-species menu including deer and hog. Lodging available.',
    website: 'https://texasfowl.com',
    phone: '(903) 449-2773',
    isVerified: true,
  },
  {
    id: 'tx-08',
    name: 'Dirty Texas Outfitters',
    slug: 'dirty-texas-outfitters',
    city: 'Loraine',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Mallard', 'Teal', 'Canada Goose', 'Snow Goose', 'Sandhill Crane', 'Whitetail Deer', 'Axis Deer', 'Blackbuck Antelope', 'Wild Hog', 'Quail', 'Dove', 'Turkey'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Full-service outfitter covering nearly every huntable species in Texas. Waterfowl, upland, thermal hog hunts, and big game packages. Hosts the Fowl Talk Podcast.',
    website: 'https://dirtytexasoutfitters.com',
    phone: null,
    isVerified: true,
  },
  {
    id: 'tx-09',
    name: 'Fin & Fowl Outfitters',
    slug: 'fin-and-fowl-outfitters',
    city: 'Texas Coastal Prairie',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Mallard', 'Teal', 'Gadwall', 'Canada Goose', 'Snow Goose', 'Wild Hog'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Guided duck, goose, and coastal hunting along the Texas Coastal Prairie. Also offers alligator and hog hunts.',
    website: 'https://finandfowloutfitters.com',
    phone: null,
    isVerified: true,
  },
  {
    id: 'tx-10',
    name: 'North Texas Waterfowl',
    slug: 'north-texas-waterfowl',
    city: 'Hagerman NWR area',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Mallard', 'Pintail', 'Teal', 'Canada Goose', 'Snow Goose'],
    huntTypes: ['guided'],
    priceRange: '$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Boutique operation hunting private land adjacent to Hagerman NWR. One hunting party per day for an exclusive experience.',
    website: 'https://northtexaswaterfowl.com',
    phone: null,
    isVerified: true,
  },
  {
    id: 'tx-11',
    name: 'Final Descent Guide Services',
    slug: 'final-descent-guide-services',
    city: 'Lubbock',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Mallard', 'Teal', 'Canada Goose', 'Snow Goose', 'Sandhill Crane'],
    huntTypes: ['guided'],
    priceRange: '$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Lubbock-based waterfowl guide service offering duck, goose, and crane hunts across the Texas Panhandle and South Plains.',
    website: 'https://www.finaldescentguiding.com',
    phone: null,
    isVerified: true,
  },
  {
    id: 'tx-12',
    name: 'Cadillac Creek Outfitters',
    slug: 'cadillac-creek-outfitters',
    city: 'Amarillo',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Mallard', 'Pintail', 'Teal', 'Canada Goose', 'Snow Goose', 'Sandhill Crane'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Upscale waterfowl outfitter in the Texas Panhandle with guided duck, goose, and sandhill crane hunts. Full lodge accommodations with chef-prepared meals.',
    website: 'https://cadillaccreek.com',
    phone: '(806) 602-9517',
    isVerified: true,
  },
  {
    id: 'tx-13',
    name: 'Rockin G Ranch',
    slug: 'rockin-g-ranch',
    city: 'Turkey',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Whitetail Deer', 'Mule Deer', 'Elk', 'Dove', 'Quail', 'Pheasant', 'Wild Hog', 'Turkey'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: '$300/day hunter fee + trophy fees',
    rating: null,
    reviewCount: 0,
    description: 'Full-service ranch in Hall County offering high-fence and low-fence big game hunts alongside wing shooting for dove, quail, and pheasant. Also offers hog hunts and fishing.',
    website: 'https://rockinggranch.com',
    phone: '(806) 342-5000',
    isVerified: true,
  },
  {
    id: 'tx-14',
    name: 'Ambush Waterfowl',
    slug: 'ambush-waterfowl',
    city: 'Abilene',
    state: 'TX',
    statesServed: ['TX'],
    speciesOffered: ['Sandhill Crane', 'Mallard', 'Teal', 'Canada Goose'],
    huntTypes: ['guided'],
    priceRange: '$$$',
    priceNote: 'Contact for pricing',
    rating: null,
    reviewCount: 0,
    description: 'Guided sandhill crane and waterfowl hunts across grain fields in the Central Flyway near Abilene. Specializes in crane hunting during peak migration.',
    website: null,
    phone: null,
    isVerified: true,
  },
]

const STATES_WITH_OUTFITTERS = [...new Set(OUTFITTERS.map(o => o.state))].sort()

export const outfittersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', {
    schema: {
      tags: ['outfitters'],
      summary: 'List and search outfitters',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          state: { type: 'string' },
          species: { type: 'string' },
          priceRange: { type: 'string' },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            outfitters: { type: 'array' },
            total: { type: 'number' },
            states: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  }, async (request) => {
    const { q, state, species, priceRange, limit = 50, offset = 0 } = request.query as {
      q?: string
      state?: string
      species?: string
      priceRange?: string
      limit?: number
      offset?: number
    }

    let results = [...OUTFITTERS]

    if (state) {
      results = results.filter(o =>
        o.state === state.toUpperCase() || o.statesServed.includes(state.toUpperCase())
      )
    }

    if (species) {
      const needle = species.toLowerCase()
      results = results.filter(o =>
        o.speciesOffered.some(s => s.toLowerCase().includes(needle))
      )
    }

    if (priceRange) {
      results = results.filter(o => o.priceRange === priceRange)
    }

    if (q) {
      const needle = q.toLowerCase()
      results = results.filter(o =>
        o.name.toLowerCase().includes(needle) ||
        o.city.toLowerCase().includes(needle) ||
        o.state.toLowerCase().includes(needle) ||
        o.speciesOffered.some(s => s.toLowerCase().includes(needle))
      )
    }

    // Verified first, then alphabetical
    results.sort((a, b) => {
      if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    const total = results.length
    const paginated = results.slice(offset, offset + limit)

    return { outfitters: paginated, total, states: STATES_WITH_OUTFITTERS }
  })

  app.get('/:id', {
    schema: {
      tags: ['outfitters'],
      summary: 'Get outfitter details',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const outfitter = OUTFITTERS.find(o => o.id === id || o.slug === id)
    if (!outfitter) {
      return reply.status(404).send({ error: true, message: 'Outfitter not found' })
    }
    return { outfitter }
  })
}
