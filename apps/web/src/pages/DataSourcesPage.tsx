import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import type { StateCoverage } from '../lib/api'

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
  cadence: 'Checked weekly, Mondays',
  sources: [
    {
      name: 'Washita National Wildlife Refuge (OK)',
      url: 'https://www.fws.gov/locations/washita-national-wildlife-refuge/latest-waterfowl-survey',
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
      name: 'Louisiana Dept. of Wildlife & Fisheries — Aerial Survey (LA)',
      url: 'https://www.wlf.louisiana.gov/page/aerial-waterfowl-surveys',
      note: 'Monthly aerial survey PDFs',
    },
    {
      name: 'Illinois Natural History Survey, Forbes Biological Station — Aerial Inventory (IL, MO, IA)',
      url: 'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/',
      note: 'Weekly flights, Sept–Jan; 43 sites on the Illinois and central Mississippi rivers, including Clarence Cannon NWR',
    },
    {
      name: 'Friends of Hagerman NWR — Weekly Bird Census (TX)',
      url: 'https://friendsofhagerman.com/Birding-Jack',
      note: 'Volunteer count every Tuesday on Hagerman NWR, read from its eBird checklists',
    },
    {
      name: 'Texas Parks & Wildlife — Mid-Winter Waterfowl Survey (TX)',
      url: 'https://tpwd.texas.gov/huntwild/wild/game_management/waterfowl/',
      note: 'Annual survey, published as Excel workbooks',
    },
    {
      name: 'USFWS — Central Flyway Mid-Winter Waterfowl Survey report',
      url: 'https://fws.gov/sites/default/files/documents/2025-02/central-flyway-midwinter-survey-report-2024.pdf',
      note: 'Annual January counts for KS, NM, OK and TX, 2017–2024',
    },
  ],
}

const OTHER_GROUPS: SourceGroup[] = [
  {
    title: 'Regulations & Licensing',
    description:
      'State agency regulation documents, seasons, bag limits, and license requirements — extracted and indexed for the Regulations pages and the AI chat. Currently covers Texas (fully populated), with New Mexico, Arkansas, Louisiana, Kansas, and Oklahoma seeded.',
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
      'Where each species is being reported: places with a report in the last 14 days statewide, the latest report near each refuge, and the change since two weeks earlier, from eBird\'s public data, shown next to refuge survey counts on the Migration dashboard, counted toward Where to Hunt\'s areas, and used by the AI chat. eBird also covers places with no published refuge counts: the Texas Panhandle (Amarillo, Lubbock, Dalhart and Hereford-Dimmitt playas) and Cheyenne Bottoms, Kansas. These are the latest sightings reported by birders, not survey totals.',
    cadence: 'Live API',
    sources: [{ name: 'eBird (Cornell Lab of Ornithology)', url: 'https://ebird.org/' }],
  },
  {
    title: 'Public Land & Places',
    description:
      'Where to Hunt groups every count and report into areas named after a nearby town, and lists the public land in and around each one: state wildlife and conservation areas, national wildlife refuges, waterfowl production areas and Corps of Engineers land. The land comes from the USGS Protected Areas Database, which records public access (open, or by permit or season), not hunting rules, so always check the managing agency. Where HuntStack has checked a place itself and found it closed to waterfowl hunting, that wins. Town names, counties and populations come from the Census Bureau.',
    cadence: 'Updated yearly, when the USGS and Census publish new editions',
    sources: [
      {
        name: 'USGS Protected Areas Database of the United States (PAD-US) — Public Access',
        url: 'https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-overview',
        note: '1,556 public units in the nine states',
      },
      {
        name: 'U.S. Census Bureau — Gazetteer Files and City Population Estimates',
        url: 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html',
        note: '8,660 towns and places, 2024 Gazetteer and 2023 population estimates',
      },
      {
        name: 'USGS 3D Elevation Program, via AWS Terrain Tiles',
        url: 'https://registry.opendata.aws/terrain-tiles/',
        note: 'Contour lines in the home page background: the Illinois and Mississippi rivers at Grafton, IL',
      },
    ],
  },
  {
    title: 'River Levels',
    description:
      'The map\'s River levels layer shows USGS stream gauges on rivers draining at least 1,000 square miles, each colored by how its latest flow compares with that gauge\'s own record for this time of year: much below, below, normal, above or much above normal (USGS\'s own percentile bands). Each gauge\'s normal comes from USGS\'s published daily flow statistics, kept for each half of the month; the latest flows and the change since a week ago come from USGS Water Data. It is flow, not stage: how much water the river carries, not how high it stands at a given spot. USGS readings are provisional.',
    cadence: 'Latest flows hourly; normals updated yearly',
    sources: [
      {
        name: 'USGS Water Data — stream gauges',
        url: 'https://waterdata.usgs.gov/',
        note: '569 gauges in and along the nine states, each with 10+ years of records',
      },
      {
        name: 'USGS daily streamflow statistics',
        url: 'https://waterservices.usgs.gov/docs/statistics/',
        note: 'The 10th, 25th, 50th, 75th and 90th percentiles of each gauge\'s daily flow',
      },
    ],
  },
  {
    title: 'Weather',
    description:
      'Forecasts, alerts, and hunting-condition scoring (wind, precipitation, cold-front detection) for Where to Hunt\'s areas and the refuge detail pages.',
    cadence: 'Live API',
    sources: [{ name: 'National Weather Service (NOAA)', url: 'https://www.weather.gov/documentation/services-web-api' }],
  },
  {
    title: 'Web Search (AI Chat)',
    description:
      'Each chat question also searches the web, so answers can cover topics beyond our own data, like gear, tactics and states we have not added yet. Web results are cited by link under each answer, separately from our own data. Our season records still decide dates, bag limits and prices, and agency pages count over third-party sites.',
    cadence: 'Live, per question',
    sources: [
      { name: 'OpenRouter web search', url: 'https://openrouter.ai/docs/guides/features/plugins/web-search' },
      { name: 'Exa (search engine)', url: 'https://exa.ai/' },
    ],
  },
  {
    title: 'Geocoding',
    description: 'ZIP-code and place-name lookups used for location search and "near me" distance filtering.',
    cadence: 'Live API',
    sources: [{ name: 'OpenStreetMap Nominatim', url: 'https://nominatim.org/' }],
  },
]

/** The table's columns: what each covered state has, from GET /api/states/coverage */
const COVERAGE_COLUMNS: Array<{ label: string; title: string; value: (s: StateCoverage) => string }> = [
  { label: 'Seasons', title: 'Season dates and limits for this season', value: s => String(s.seasons) },
  { label: 'Licenses', title: 'Licenses, stamps and permits', value: s => String(s.licenses) },
  { label: 'Rule docs', title: 'Regulation documents Ask AI searches', value: s => String(s.documents) },
  {
    label: 'Survey sites',
    title: 'Survey sites with counts (with a count in the last 45 days)',
    value: s => (s.surveySites === 0 ? '0' : `${s.surveySites} (${s.surveySitesRecent})`),
  },
  { label: 'Statewide survey', title: 'The agency survey of the whole state HuntStack loads', value: s => s.statewideSurvey ?? '—' },
  { label: 'eBird areas', title: 'eBird areas HuntStack watches (every public eBird hotspot is used as well)', value: s => String(s.ebirdPlaces) },
  { label: 'Public land', title: 'Public land units (USGS PAD-US)', value: s => String(s.publicLands) },
  { label: 'River gauges', title: 'USGS river gauges on the map', value: s => String(s.riverGauges) },
  { label: 'Zone shapes', title: 'Season zone shapes on the map', value: s => String(s.zoneShapes) },
]

function CoverageTable({ states }: { states: StateCoverage[] }) {
  return (
    <div
      className="rounded-lg border p-5"
      style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))` }}
    >
      <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
        What HuntStack has for each state
      </h2>
      <p className="text-sm mb-4" style={{ color: `rgb(var(--color-text-secondary))` }}>
        Counted from HuntStack's own data, so a state with gaps shows them. Survey sites in brackets had a count in the
        last 45 days. A dash under Statewide survey means the state is counted at its survey sites only.
      </p>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ color: `rgb(var(--color-text-tertiary))` }}>
              <th scope="col" className="text-left font-medium py-2 pr-3 whitespace-nowrap">State</th>
              {COVERAGE_COLUMNS.map(c => (
                <th key={c.label} scope="col" title={c.title} className="text-right font-medium py-2 px-2 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {states.map(s => (
              <tr key={s.code} className="border-t" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
                <th scope="row" className="text-left font-medium py-2 pr-3 whitespace-nowrap" style={{ color: `rgb(var(--color-text-primary))` }}>
                  {s.name}
                </th>
                {COVERAGE_COLUMNS.map(c => (
                  <td key={c.label} className="text-right py-2 px-2 whitespace-nowrap tabular-nums" style={{ color: `rgb(var(--color-text-secondary))` }}>
                    {c.value(s)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SourceCard({ group, summary }: { group: SourceGroup; summary?: string | null }) {
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
          className="text-xs px-2 py-0.5 rounded-md"
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
      {summary && (
        <p className="text-sm font-medium mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>
          {summary}
        </p>
      )}
      <ul className="space-y-2">
        {group.sources.map((source) => (
          <li key={source.url} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5 text-sm">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-500 hover:underline inline-flex items-center gap-1.5 min-w-0 [overflow-wrap:anywhere] py-1"
            >
              {source.name}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
            {source.note && (
              <span className="text-xs py-1" style={{ color: `rgb(var(--color-text-tertiary))` }}>
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
  const [coverage, setCoverage] = useState<string | null>(null)
  const [stateCoverage, setStateCoverage] = useState<StateCoverage[] | null>(null)

  useEffect(() => {
    api.getStateCoverage()
      .then(({ states }) => setStateCoverage(states))
      .catch(() => setStateCoverage(null))
    api.getSurveyCoverage()
      .then(({ sites, states }) => {
        if (sites > 0) {
          setCoverage(`${sites} survey sites across ${states.length} states: ${states.map(s => s.state).join(', ')}.`)
        }
      })
      .catch(() => setCoverage(null))
  }, [])

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
        {stateCoverage && stateCoverage.length > 0 && <CoverageTable states={stateCoverage} />}
        <SourceCard group={REFUGE_COUNT_SOURCES} summary={coverage} />
        {OTHER_GROUPS.map((group) => (
          <SourceCard key={group.title} group={group} />
        ))}
      </div>
    </div>
  )
}
