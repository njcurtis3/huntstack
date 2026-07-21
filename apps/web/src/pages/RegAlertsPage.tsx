import { Link } from 'react-router-dom'
import { BellRing } from 'lucide-react'

export function RegAlertsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ backgroundColor: `rgb(var(--color-bg-elevated))` }}
      >
        <BellRing className="w-6 h-6 text-accent-500" />
      </div>

      <h1 className="text-2xl font-bold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>
        Regulation Alerts
      </h1>

      <p className="text-sm mb-2" style={{ color: `rgb(var(--color-text-secondary))` }}>
        Not built yet — there's no notification system in place.
      </p>
      <p className="text-sm mb-8" style={{ color: `rgb(var(--color-text-secondary))` }}>
        The idea: get notified when a state changes its seasons, bag limits, or license requirements, so
        outfitters and hunters don't find out by re-reading a PDF. That needs a few things we haven't built
        yet — an account to notify, a way to say which states you care about, and (the harder part) a way
        for our scrapers to detect that something actually <em>changed</em> between runs, not just
        re-record the same data. It's on the roadmap, not forgotten.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/regulations" className="btn-primary text-sm">
          Browse Regulations
        </Link>
        <Link to="/about" className="btn-secondary text-sm">
          About HuntStack
        </Link>
      </div>

      <p className="text-xs mt-8" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        Want to be notified when this ships? Contact the site owner directly.
      </p>
    </div>
  )
}
