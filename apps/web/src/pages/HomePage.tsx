import { Link } from 'react-router-dom'
import { ArrowRight, TrendingUp, MapPin, FileText, MessageSquare, Bird, Zap, BarChart2, Compass } from 'lucide-react'

const features = [
  {
    icon: Bird,
    title: 'Migration Intelligence',
    description: 'Live refuge counts, week-over-week deltas, cold front push scores, and flyway flow — updated weekly.',
    href: '/migration',
    cta: 'View Dashboard',
  },
  {
    icon: Compass,
    title: 'Where to Hunt',
    description: 'Ranked public hunting areas scored by current bird activity, open seasons, weather, and distance from you.',
    href: '/where-to-hunt',
    cta: 'Find Locations',
  },
  {
    icon: FileText,
    title: 'Regulation Intelligence',
    description: 'Structured seasons, bag limits, and license requirements for TX, NM, AR, LA, KS, OK — no PDFs.',
    href: '/regulations',
    cta: 'Check Regulations',
  },
  {
    icon: MessageSquare,
    title: 'Ask AI',
    description: 'Natural language queries over structured data. Ask about licenses, seasons, or where birds are moving.',
    href: '/chat',
    cta: 'Ask a Question',
  },
]

const stats = [
  { value: '800+', label: 'Refuge count rows' },
  { value: '7', label: 'Live data sources' },
  { value: '6', label: 'Priority states' },
  { value: '2', label: 'Flyways covered' },
]

const flyways = [
  { name: 'Central Flyway', states: 'TX · NM · KS · OK', color: 'text-forest-400' },
  { name: 'Mississippi Flyway', states: 'AR · LA · MO', color: 'text-accent-400' },
]

export function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-earth-900 dark:bg-[#0d1117] border-b border-earth-800 dark:border-[#21262d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-forest-700 bg-forest-900/40 mb-6">
              <span className="w-2 h-2 rounded-full bg-forest-400 animate-pulse" />
              <span className="text-xs font-medium text-forest-300 tracking-wide uppercase">Central &amp; Mississippi Flyways</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white">
              Pre-hunt intelligence
              <span className="text-forest-400">.</span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-earth-300 leading-relaxed">
              Replace Googling across state websites and PDF regulations with structured data, live refuge counts, and AI.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link to="/migration" className="btn-primary text-base px-6 py-3 inline-flex items-center justify-center">
                <TrendingUp className="mr-2 w-5 h-5" />
                Migration Dashboard
              </Link>
              <Link
                to="/where-to-hunt"
                className="btn inline-flex items-center justify-center bg-white/10 text-white hover:bg-white/20 border border-white/20 text-base px-6 py-3"
              >
                <MapPin className="mr-2 w-5 h-5" />
                Where to Hunt
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section
        className="border-b"
        style={{
          backgroundColor: `rgb(var(--color-bg-secondary))`,
          borderColor: `rgb(var(--color-border-primary))`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x"
            >
            {stats.map((stat) => (
              <div key={stat.label} className="px-6 first:pl-0 last:pr-0 text-center">
                <div className="text-2xl font-bold text-forest-500 dark:text-forest-400">{stat.value}</div>
                <div className="text-sm mt-0.5" style={{ color: `rgb(var(--color-text-secondary))` }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-16 md:py-20" style={{ backgroundColor: `rgb(var(--color-bg-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h2 className="text-2xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
              Everything you need before you leave the truck
            </h2>
            <p className="mt-2 text-base" style={{ color: `rgb(var(--color-text-secondary))` }}>
              Built for waterfowl hunters who plan around refuge counts, weather fronts, and migration timing.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f) => (
              <Link
                key={f.title}
                to={f.href}
                className="group rounded-lg border p-6 transition-colors hover:border-forest-500/50 dark:hover:border-forest-600/50"
                style={{
                  backgroundColor: `rgb(var(--color-bg-elevated))`,
                  borderColor: `rgb(var(--color-border-primary))`,
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-2 rounded-md bg-forest-900/30 dark:bg-forest-900/50 border border-forest-800/40">
                    <f.icon className="w-5 h-5 text-forest-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-base" style={{ color: `rgb(var(--color-text-primary))` }}>
                        {f.title}
                      </h3>
                      <ArrowRight
                        className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-forest-400"
                      />
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: `rgb(var(--color-text-secondary))` }}>
                      {f.description}
                    </p>
                    <span className="mt-3 inline-block text-sm font-medium text-forest-500 dark:text-forest-400">
                      {f.cta} →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Flyway coverage */}
      <section
        className="border-t border-b py-12"
        style={{
          backgroundColor: `rgb(var(--color-bg-secondary))`,
          borderColor: `rgb(var(--color-border-primary))`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center gap-8">
            <div className="md:w-1/3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-forest-400" />
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                  Coverage
                </span>
              </div>
              <h2 className="text-xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
                Central &amp; Mississippi Flyways
              </h2>
              <p className="mt-2 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
                V1 focuses on the highest-volume waterfowl corridors in North America, with weekly survey data from federal and state sources.
              </p>
            </div>
            <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {flyways.map((fw) => (
                <div
                  key={fw.name}
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: `rgb(var(--color-bg-elevated))`,
                    borderColor: `rgb(var(--color-border-primary))`,
                  }}
                >
                  <div className={`text-sm font-semibold ${fw.color}`}>{fw.name}</div>
                  <div className="mt-1 text-sm font-mono tracking-wide" style={{ color: `rgb(var(--color-text-secondary))` }}>
                    {fw.states}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="py-14" style={{ backgroundColor: `rgb(var(--color-bg-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
            style={{
              backgroundColor: `rgb(var(--color-bg-secondary))`,
              borderColor: `rgb(var(--color-border-primary))`,
            }}
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="w-4 h-4 text-forest-400" />
                <span className="text-xs font-semibold uppercase tracking-widest text-forest-500 dark:text-forest-400">Live Data</span>
              </div>
              <h3 className="text-lg font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
                See what's moving right now
              </h3>
              <p className="mt-1 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
                Weekly refuge counts from USFWS, AGFC, LDWF, and eBird — with push factor scoring and migration status.
              </p>
            </div>
            <div className="flex-shrink-0">
              <Link to="/migration" className="btn-primary inline-flex items-center px-5 py-2.5 text-sm">
                <TrendingUp className="mr-2 w-4 h-4" />
                Open Migration Dashboard
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
