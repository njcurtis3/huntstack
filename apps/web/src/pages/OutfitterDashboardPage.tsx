import { Link } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'

export function OutfitterDashboardPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ backgroundColor: `rgb(var(--color-bg-elevated))` }}
      >
        <LayoutDashboard className="w-6 h-6 text-accent-500" />
      </div>

      <h1 className="text-2xl font-bold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>
        Outfitter Dashboard
      </h1>

      <p className="text-sm mb-2" style={{ color: `rgb(var(--color-text-secondary))` }}>
        Not built yet — outfitter listings are currently managed directly in our database.
      </p>
      <p className="text-sm mb-8" style={{ color: `rgb(var(--color-text-secondary))` }}>
        Once self-service management ships, this is where you'll edit your listing details, respond to
        reviews, and see how often your business shows up in search and recommendations. It's gated behind
        the same sign-in step as the rest of the site, so it needs account-aware routes we haven't wired up
        yet.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/outfitters" className="btn-primary text-sm">
          Browse Outfitter Directory
        </Link>
        <Link to="/about" className="btn-secondary text-sm">
          About HuntStack
        </Link>
      </div>

      <p className="text-xs mt-8" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        Run an outfitting business and want to be listed, or want early access when this launches? Contact
        the site owner directly.
      </p>
    </div>
  )
}
