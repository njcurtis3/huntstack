import { ExternalLink } from 'lucide-react'

type Source = {
  name: string
  url: string
  note?: string
}

type SourceGroup = {
  title: string
  description: string
  cadence: string
  sources: Source[]
}

const REFUGE_COUNT_SOURCES: SourceGroup = {
  title: 'Migration & Refuge Counts',
  description:
    'Weekly and periodic waterfowl survey counts, scraped directly from state and federal wildlife agencies and used to power the Migration Intelligence dashboard and push-factor scoring.',
  cadence: 'Weekly (Task Scheduler, Mondays 6am)',
  sources: [
    {
      name: 'Washita National Wildlife Refuge (OK)',
      url: 'https://www.fws.gov/refuge/washita/latest-waterfowl-survey',
    },
    {
      name: 'Salt Plains National Wildlife Refuge (OK)',
      url: 'https://www.fws.gov/story/weekly-waterfowl-survey',
    },
    {
      name: 'Arkansas Game & Fish Commission — Aerial Survey (AR)',
      url: 'https://www.agfc.com/education/waterfowl-surveys-and-reports/',
      note: 'Biweekly aerial survey PDFs',
    },
    {
      name: 'Loess Bluffs National Wildlife Refuge (MO)',
      url: 'https://www.fws.gov/library/collections/loess-bluffs-2025-waterfowl-and-bald-eagle-surveys',
    },
    {
      name: 'Clarence Cannon National Wildlife Refuge (MO)',
      url: 'https://www.fws.gov/refuge/clarence-cannon/clarence-cannon-nwr-waterfowl-surveys',
    },
    {
      name: 'Louisiana Dept. of Wildlife & Fisheries — Aerial Survey (LA)',
      url: 'https://www.wlf.louisiana.gov/page/aerial-waterfowl-surveys',
      note: 'Monthly aerial survey PDFs',
    },
    {
      name: 'Texas Parks & Wildlife — Mid-Winter Waterfowl Survey (TX)',
      url: 'https://tpwd.texas.gov/huntwild/wild/game_management/waterfowl/',
      note: 'Annual survey, published as Excel workbooks',
    },
  ],
}

const OTHER_GROUPS: SourceGroup[] = [
  {
    title: 'Regulations & Licensing',
    description:
      'State agency regulation documents, seasons, bag limits, and license requirements — extracted and indexed for the Regulations pages and the RAG-powered chat assistant. Currently covers Texas (fully populated), with New Mexico, Arkansas, Louisiana, Kansas, and Oklahoma seeded.',
    cadence: 'Checked periodically; re-scraped when agencies publish season updates',
    sources: [
      { name: 'Texas Parks & Wildlife Department', url: 'https://tpwd.texas.gov/' },
      { name: 'New Mexico Dept. of Game & Fish', url: 'https://www.wildlife.dgf.nm.gov/' },
      { name: 'Arkansas Game & Fish Commission', url: 'https://www.agfc.com/' },
      { name: 'Louisiana Dept. of Wildlife & Fisheries', url: 'https://www.wlf.louisiana.gov/' },
      { name: 'Kansas Dept. of Wildlife & Parks', url: 'https://ksoutdoors.com/' },
      { name: 'Oklahoma Dept. of Wildlife Conservation', url: 'https://www.wildlifedepartment.com/' },
    ],
  },
  {
    title: 'Community Bird Observations',
    description:
      'Regional species activity and 14-day trend comparisons, sourced from eBird\'s public checklist data, cross-referenced against refuge survey counts for the Migration dashboard.',
    cadence: 'Live API',
    sources: [{ name: 'eBird (Cornell Lab of Ornithology)', url: 'https://ebird.org/' }],
  },
  {
    title: 'Weather',
    description:
      'Forecasts, alerts, and hunting-condition scoring (wind, precipitation, cold-front detection) for the Where to Hunt recommendations and refuge detail pages.',
    cadence: 'Live API',
    sources: [{ name: 'National Weather Service (NOAA)', url: 'https://www.weather.gov/documentation/services-web-api' }],
  },
  {
    title: 'Geocoding',
    description: 'ZIP-code and place-name lookups used for location search and "near me" distance filtering.',
    cadence: 'Live API',
    sources: [{ name: 'OpenStreetMap Nominatim', url: 'https://nominatim.org/' }],
  },
]

function SourceCard({ group }: { group: SourceGroup }) {
  return (
    <div
      className="rounded-lg border p-5"
      style={{
        backgroundColor: `rgb(var(--color-bg-elevated))`,
        borderColor: `rgb(var(--color-border-primary))`,
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <h2 className="text-lg font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
          {group.title}
        </h2>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `rgb(var(--color-bg-secondary))`,
            color: `rgb(var(--color-text-tertiary))`,
          }}
        >
          {group.cadence}
        </span>
      </div>
      <p className="text-sm mb-4" style={{ color: `rgb(var(--color-text-secondary))` }}>
        {group.description}
      </p>
      <ul className="space-y-2">
        {group.sources.map((source) => (
          <li key={source.url} className="flex items-start justify-between gap-2 text-sm">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-500 hover:underline flex items-center gap-1.5"
            >
              {source.name}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
            {source.note && (
              <span className="text-xs flex-shrink-0" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                {source.note}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DataSourcesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>
        Data Sources
      </h1>
      <p className="text-sm mb-8 max-w-2xl" style={{ color: `rgb(var(--color-text-secondary))` }}>
        HuntStack aggregates public data from federal and state wildlife agencies rather than collecting
        our own field data. Every figure you see is traceable back to one of the sources below. Regulations
        change — always confirm season dates, bag limits, and license requirements with the official agency
        before you hunt.
      </p>
      <div className="space-y-6">
        <SourceCard group={REFUGE_COUNT_SOURCES} />
        {OTHER_GROUPS.map((group) => (
          <SourceCard key={group.title} group={group} />
        ))}
      </div>
    </div>
  )
}
