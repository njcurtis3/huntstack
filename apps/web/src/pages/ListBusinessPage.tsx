import { Link } from 'react-router-dom'
import { Store } from 'lucide-react'

export function ListBusinessPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ backgroundColor: `rgb(var(--color-bg-elevated))` }}
      >
        <Store className="w-6 h-6 text-accent-500" />
      </div>

      <h1 className="text-2xl font-bold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>
        List Your Business
      </h1>

      <p className="text-sm mb-2" style={{ color: `rgb(var(--color-text-secondary))` }}>
        There's no self-service signup form yet — listings are added by hand today.
      </p>
      <p className="text-sm mb-8" style={{ color: `rgb(var(--color-text-secondary))` }}>
        If you run a waterfowl outfitting business in Texas, New Mexico, Arkansas, Louisiana, Kansas, or
        Oklahoma and want to be listed in the{' '}
        <Link to="/outfitters" className="text-accent-500 hover:underline">Outfitter Directory</Link>,
        reach out with your business name, location, species/hunt types offered, and pricing, and we'll
        add it. A self-service version — where you manage your own listing from a{' '}
        <Link to="/outfitters/dashboard" className="text-accent-500 hover:underline">dashboard</Link> — is
        planned once account-aware routes are wired up.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/outfitters" className="btn-primary text-sm">
          View Current Listings
        </Link>
        <Link to="/about" className="btn-secondary text-sm">
          About HuntStack
        </Link>
      </div>

      <p className="text-xs mt-8" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        To get listed, <Link to="/contact" className="text-accent-500 hover:underline">get in touch</Link>.
      </p>
    </div>
  )
}
