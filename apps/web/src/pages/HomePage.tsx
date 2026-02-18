import { Link } from 'react-router-dom'
import { Search, Map, FileText, MessageSquare, ArrowRight } from 'lucide-react'

const features = [
  {
    icon: Search,
    title: 'Comprehensive Search',
    description: 'Find hunting opportunities by species, location, season, and more.',
    href: '/search',
  },
  {
    icon: Map,
    title: 'Interactive Maps',
    description: 'Explore public lands, hunting units, and access points.',
    href: '/map',
  },
  {
    icon: FileText,
    title: 'Regulations Database',
    description: 'Current regulations for all 50 states, updated regularly.',
    href: '/regulations',
  },
  {
    icon: MessageSquare,
    title: 'AI Assistant',
    description: 'Ask questions about hunting in natural language.',
    href: '/chat',
  },
]

const popularSpecies = [
  { name: 'Whitetail Deer', count: '48 states' },
  { name: 'Elk', count: '12 states' },
  { name: 'Mallard', count: '50 states' },
  { name: 'Wild Turkey', count: '49 states' },
  { name: 'Mule Deer', count: '19 states' },
  { name: 'Canada Goose', count: '50 states' },
]

export function HomePage() {
  return (
    <div>
      {/* Hero Section — GitHub-style dark banner */}
      <section className="bg-earth-900 dark:bg-[#0d1117] border-b border-earth-800 dark:border-[#21262d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white">
              Pre-hunt intelligence
              <span className="text-forest-400">.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-earth-300 leading-relaxed">
              The open data and AI platform for modern hunters and outfitters.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link to="/search" className="btn-primary text-base px-6 py-3">
                Start Searching
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
              <Link to="/chat" className="btn bg-white/10 text-white hover:bg-white/20 border border-white/20 text-base px-6 py-3">
                Ask AI Assistant
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16" style={{ backgroundColor: `rgb(var(--color-bg-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>Plan Your Hunt</h2>
            <p className="mt-3 text-base" style={{ color: `rgb(var(--color-text-secondary))` }}>
              Search. Maps. Regulations. AI Assistant. For all 50 US states
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <Link
                key={feature.title}
                to={feature.href}
                className="card p-5 hover:border-accent-400 dark:hover:border-accent-500 transition-colors group"
              >
                <div className="w-10 h-10 bg-accent-50 dark:bg-accent-900/30 rounded-md flex items-center justify-center mb-3 group-hover:bg-accent-100 dark:group-hover:bg-accent-900/50 transition-colors">
                  <feature.icon className="w-5 h-5 text-accent-500" />
                </div>
                <h3 className="font-semibold text-sm mb-1" style={{ color: `rgb(var(--color-text-primary))` }}>{feature.title}</h3>
                <p className="text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>{feature.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Species */}
      <section className="py-16 border-t" style={{ backgroundColor: `rgb(var(--color-bg-secondary))`, borderColor: `rgb(var(--color-border-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>Popular Species</h2>
            <p className="mt-3 text-base" style={{ color: `rgb(var(--color-text-secondary))` }}>
              Browse regulations and seasons for the most popular game.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {popularSpecies.map((species) => (
              <Link
                key={species.name}
                to={`/search?species=${encodeURIComponent(species.name)}`}
                className="card p-4 text-center hover:border-accent-400 dark:hover:border-accent-500 transition-colors"
              >
                <h3 className="font-medium text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>{species.name}</h3>
                <p className="text-xs mt-1" style={{ color: `rgb(var(--color-text-tertiary))` }}>{species.count}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA for Outfitters */}
      <section className="py-16 bg-earth-900 dark:bg-[#161b22] border-t border-earth-800 dark:border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-semibold text-white mb-4">Are You an Outfitter?</h2>
          <p className="text-earth-300 text-base max-w-2xl mx-auto mb-8">
            List your business on HuntStack to reach thousands of hunters.
            Get regulation alerts, manage your profile, and grow your client base.
          </p>
          <button className="btn bg-white text-earth-900 hover:bg-earth-100 px-6 py-3 text-sm font-medium">
            List Your Business
          </button>
        </div>
      </section>
    </div>
  )
}
