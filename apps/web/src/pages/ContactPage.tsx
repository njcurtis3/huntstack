import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'

const CONTACT_EMAIL = 'nathanjcurtis3@gmail.com'

export function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ backgroundColor: `rgb(var(--color-bg-elevated))` }}
      >
        <Mail className="w-6 h-6 text-accent-500" />
      </div>

      <h1 className="text-2xl font-bold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>
        Contact
      </h1>

      <p className="text-sm mb-8" style={{ color: `rgb(var(--color-text-secondary))` }}>
        HuntStack is a one-person project right now, so email is the fastest way to reach me — bug
        reports, wrong regulation data, outfitter listing requests, or anything else.
      </p>

      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="btn-primary text-sm inline-flex items-center gap-2"
      >
        <Mail className="w-4 h-4" />
        {CONTACT_EMAIL}
      </a>

      <p className="text-xs mt-8" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        Something wrong with the data itself? Check the{' '}
        <Link to="/data-sources" className="text-accent-500 hover:underline">Data Sources</Link> page
        first — it's worth confirming what's aggregated before reporting.
      </p>
    </div>
  )
}
