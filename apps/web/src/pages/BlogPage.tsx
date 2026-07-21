import { Link } from 'react-router-dom'
import { Newspaper } from 'lucide-react'

export function BlogPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ backgroundColor: `rgb(var(--color-bg-elevated))` }}
      >
        <Newspaper className="w-6 h-6 text-accent-500" />
      </div>

      <h1 className="text-2xl font-bold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>
        Blog
      </h1>

      <p className="text-sm mb-8" style={{ color: `rgb(var(--color-text-secondary))` }}>
        Nothing published yet. The plan is season previews, migration write-ups, and notes on new data
        sources as they get added — for now, the closest thing is the weekly narrative on the{' '}
        <Link to="/report" className="text-accent-500 hover:underline">Migration Report</Link>{' '}
        page.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/report" className="btn-primary text-sm">
          Read the Weekly Migration Report
        </Link>
        <Link to="/about" className="btn-secondary text-sm">
          About HuntStack
        </Link>
      </div>
    </div>
  )
}
