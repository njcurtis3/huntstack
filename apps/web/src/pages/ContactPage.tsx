import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Mail } from 'lucide-react'
import { CONTACT_EMAIL } from '../lib/contact'

export function ContactPage() {
  // A mailto: link does nothing on a computer with no mail app; copying always works
  const [copied, setCopied] = useState(false)
  const copyEmail = () => {
    navigator.clipboard?.writeText(CONTACT_EMAIL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div
        className="w-14 h-14 rounded-md flex items-center justify-center mx-auto mb-5"
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

      <div className="flex flex-wrap items-center justify-center gap-2">
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="btn-primary text-sm inline-flex items-center gap-2 min-h-11"
        >
          <Mail className="w-4 h-4" />
          {CONTACT_EMAIL}
        </a>
        <button type="button" onClick={copyEmail} className="btn-secondary text-sm inline-flex items-center gap-2 min-h-11">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy address'}
        </button>
      </div>

      <p className="text-xs mt-8" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        Something wrong with the data itself? Check the{' '}
        <Link to="/data-sources" className="text-accent-500 hover:underline">Data Sources</Link> page
        first — it's worth confirming what's aggregated before reporting.
      </p>
    </div>
  )
}
