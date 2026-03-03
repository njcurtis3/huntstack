import { Link } from 'react-router-dom'
import { ArrowRight, TrendingUp, MapPin } from 'lucide-react'

export function HomePage() {
  return (
    <div>
      {/* Hero Section */}
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
              <Link to="/migration" className="btn-primary text-base px-6 py-3">
                <TrendingUp className="mr-2 w-5 h-5" />
                Migration Intelligence
              </Link>
              <Link to="/where-to-hunt" className="btn bg-white/10 text-white hover:bg-white/20 border border-white/20 text-base px-6 py-3">
                <MapPin className="mr-2 w-5 h-5" />
                Where to Hunt
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
