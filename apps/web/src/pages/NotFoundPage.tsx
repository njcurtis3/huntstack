import { Link } from 'react-router-dom'
import { Home, MessageSquare } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <img src="/duck-image-1.png" alt="" className="w-16 h-16 mx-auto mb-4" />
        <h1 className="text-4xl font-bold mb-4" style={{ color: `rgb(var(--color-text-primary))` }}>Page Not Found</h1>
        <p className="mb-8 max-w-md mx-auto" style={{ color: `rgb(var(--color-text-secondary))` }}>
          Looks like this trail went cold. The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/" className="btn-primary flex items-center gap-2">
            <Home className="w-4 h-4" />
            Go Home
          </Link>
          <Link to="/chat" className="btn-secondary flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Ask AI
          </Link>
        </div>
      </div>
    </div>
  )
}
