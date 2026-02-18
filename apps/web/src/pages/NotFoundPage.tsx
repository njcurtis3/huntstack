import { Link } from 'react-router-dom'
import { Home, Search } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl mb-4">🦌</p>
        <h1 className="text-4xl font-bold mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>Page Not Found</h1>
        <p className="mb-8 max-w-md mx-auto" style={{ color: `rgb(var(--color-text-secondary))` }}>
          Looks like this trail went cold. The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/" className="btn-primary flex items-center gap-2">
            <Home className="w-4 h-4" />
            Go Home
          </Link>
          <Link to="/search" className="btn-secondary flex items-center gap-2">
            <Search className="w-4 h-4" />
            Search
          </Link>
        </div>
      </div>
    </div>
  )
}
