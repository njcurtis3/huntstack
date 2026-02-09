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
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-forest-900 via-forest-800 to-forest-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              Pre-hunt intelligence
              <span className="text-forest-300">.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-forest-100 leading-relaxed">
              The open data and AI platform for modern hunters and outfitters.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link to="/search" className="btn-primary text-base px-6 py-3">
                Start Searching
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
              <Link to="/chat" className="btn bg-white/10 text-white hover:bg-white/20 text-base px-6 py-3">
                Ask AI Assistant
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Plan Your Hunt</h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Search. Maps. Regulations. AI Assistant. For all 50 US states
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <Link
                key={feature.title}
                to={feature.href}
                className="card p-6 hover:shadow-lg transition-shadow group"
              >
                <div className="w-12 h-12 bg-forest-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-forest-200 transition-colors">
                  <feature.icon className="w-6 h-6 text-forest-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Species */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Popular Species</h2>
            <p className="mt-4 text-lg text-gray-600">
              Browse regulations and seasons for the most popular game.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {popularSpecies.map((species) => (
              <Link
                key={species.name}
                to={`/search?species=${encodeURIComponent(species.name)}`}
                className="card p-4 text-center hover:shadow-md transition-shadow"
              >
                <div className="w-16 h-16 bg-earth-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <span className="text-2xl">🦌</span>
                </div>
                <h3 className="font-medium text-gray-900 text-sm">{species.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{species.count}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA for Outfitters */}
      <section className="py-20 bg-earth-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Are You an Outfitter?</h2>
          <p className="text-earth-200 text-lg max-w-2xl mx-auto mb-8">
            List your business on HuntStack to reach thousands of hunters. 
            Get regulation alerts, manage your profile, and grow your client base.
          </p>
          <button className="btn bg-white text-earth-900 hover:bg-earth-50 px-6 py-3">
            List Your Business
          </button>
        </div>
      </section>
    </div>
  )
}
