import { ExternalLink } from 'lucide-react'

type Endpoint = {
  method: 'GET' | 'POST'
  path: string
  description: string
}

type EndpointGroup = {
  title: string
  base: string
  endpoints: Endpoint[]
}

const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    title: 'Health',
    base: '/api',
    endpoints: [
      { method: 'GET', path: '/health', description: 'Liveness check' },
      { method: 'GET', path: '/health/ready', description: 'Readiness check, including database connectivity' },
    ],
  },
  {
    title: 'Search',
    base: '/api/search',
    endpoints: [
      { method: 'GET', path: '/', description: 'Full-text search across species, regulations, and refuges' },
      { method: 'POST', path: '/semantic', description: 'Vector similarity search over embedded regulation text' },
    ],
  },
  {
    title: 'Species',
    base: '/api/species',
    endpoints: [
      { method: 'GET', path: '/', description: 'List huntable species' },
      { method: 'GET', path: '/:id', description: 'Species detail' },
      { method: 'GET', path: '/:id/regulations', description: 'Regulations referencing a species' },
      { method: 'GET', path: '/:id/migration', description: 'Migration/flyway data for a species' },
    ],
  },
  {
    title: 'Regulations',
    base: '/api/regulations',
    endpoints: [
      { method: 'GET', path: '/states', description: 'List states with regulation coverage' },
      { method: 'GET', path: '/counts', description: 'Regulation/season/license counts for every state in one call' },
      { method: 'GET', path: '/:stateCode', description: 'Full regulation text for a state' },
      { method: 'GET', path: '/:stateCode/seasons', description: 'Season dates and bag limits for a state' },
      { method: 'GET', path: '/:stateCode/licenses', description: 'License types and pricing for a state' },
    ],
  },
  {
    title: 'Refuges',
    base: '/api/refuges',
    endpoints: [
      { method: 'GET', path: '/', description: 'List tracked refuges' },
      { method: 'GET', path: '/:id/counts', description: 'Weekly/annual survey counts for a refuge' },
      { method: 'GET', path: '/migration/dashboard', description: 'Aggregated data backing the Migration dashboard' },
    ],
  },
  {
    title: 'Migration',
    base: '/api/migration',
    endpoints: [
      { method: 'GET', path: '/push-factors', description: 'Cold-front and weather push-factor scoring' },
      { method: 'GET', path: '/weekly-summary', description: 'LLM-generated weekly migration narrative' },
      { method: 'GET', path: '/flyway-progression', description: 'North-to-south migration time series' },
      { method: 'GET', path: '/regional-activity', description: 'eBird-derived regional activity with 14-day trend' },
    ],
  },
  {
    title: 'Hunt',
    base: '/api/hunt',
    endpoints: [
      { method: 'GET', path: '/recommendations', description: 'Multi-factor scored "where to hunt" recommendations' },
    ],
  },
  {
    title: 'Weather',
    base: '/api/weather',
    endpoints: [
      { method: 'GET', path: '/forecast/:refugeId', description: 'NOAA forecast for a refuge location' },
      { method: 'GET', path: '/alerts', description: 'Active NOAA weather alerts' },
      { method: 'GET', path: '/hunting-conditions/:refugeId', description: 'Wind/precipitation/cold-front hunting rating' },
    ],
  },
  {
    title: 'Geo',
    base: '/api/geo',
    endpoints: [
      { method: 'GET', path: '/zip/:zip', description: 'ZIP code to coordinates' },
      { method: 'GET', path: '/search', description: 'Place-name geocoding' },
      { method: 'GET', path: '/reverse', description: 'Coordinates to place name' },
    ],
  },
  {
    title: 'Outfitters',
    base: '/api/outfitters',
    endpoints: [
      { method: 'GET', path: '/', description: 'Search/filter outfitter directory' },
      { method: 'GET', path: '/:id', description: 'Outfitter detail' },
    ],
  },
  {
    title: 'Chat',
    base: '/api/chat',
    endpoints: [
      { method: 'POST', path: '/', description: 'RAG-powered AI chat over regulations and hunt data' },
    ],
  },
]

function MethodBadge({ method }: { method: Endpoint['method'] }) {
  const isPost = method === 'POST'
  return (
    <span
      className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{
        backgroundColor: isPost ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)',
        color: isPost ? 'rgb(96, 165, 250)' : 'rgb(74, 222, 128)',
      }}
    >
      {method}
    </span>
  )
}

function EndpointGroupCard({ group }: { group: EndpointGroup }) {
  return (
    <div
      className="rounded-lg border p-5"
      style={{
        backgroundColor: `rgb(var(--color-bg-elevated))`,
        borderColor: `rgb(var(--color-border-primary))`,
      }}
    >
      <h2 className="text-lg font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>
        {group.title}
      </h2>
      <ul className="space-y-2.5">
        {group.endpoints.map((endpoint) => (
          <li key={endpoint.path} className="flex items-start gap-3 text-sm">
            <MethodBadge method={endpoint.method} />
            <div className="min-w-0">
              <code className="font-mono text-xs" style={{ color: `rgb(var(--color-text-primary))` }}>
                {group.base === '/api' ? endpoint.path : `${group.base}${endpoint.path}`}
              </code>
              <p style={{ color: `rgb(var(--color-text-tertiary))` }}>{endpoint.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ApiPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>
        API
      </h1>
      <p className="text-sm mb-4 max-w-2xl" style={{ color: `rgb(var(--color-text-secondary))` }}>
        HuntStack's API is currently used to power this site and isn't published for third-party use yet
        — no API keys are issued. The full route surface is documented below for reference. All routes
        are unauthenticated reads with the exception of chat, which is an unauthenticated-by-design POST.
      </p>
      <p className="text-sm mb-8 max-w-2xl" style={{ color: `rgb(var(--color-text-secondary))` }}>
        Interactive Swagger docs (request/response schemas, "try it out") are available at{' '}
        <code className="font-mono text-xs">/docs</code> when running the API locally in development —
        they're disabled in production since they expose the full route surface.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {ENDPOINT_GROUPS.map((group) => (
          <EndpointGroupCard key={group.title} group={group} />
        ))}
      </div>
      <p className="text-xs mt-8 flex items-center gap-1.5" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        Built with Fastify and OpenAPI (via
        <a
          href="https://github.com/fastify/fastify-swagger"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-500 hover:underline inline-flex items-center gap-1"
        >
          @fastify/swagger
          <ExternalLink className="w-3 h-3" />
        </a>
        ).
      </p>
    </div>
  )
}
