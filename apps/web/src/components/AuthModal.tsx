import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

interface AuthModalProps {
  mode: 'signin' | 'signup'
  onClose: () => void
}

export function AuthModal({ mode: initialMode, onClose }: AuthModalProps) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const { login, register } = useAuthStore()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await login(email, password)
        onClose()
      } else {
        await register(email, password)
        setConfirmationSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg shadow-xl p-6"
        style={{ backgroundColor: 'rgb(var(--color-bg-elevated))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'rgb(var(--color-text-primary))' }}>
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-earth-100 dark:hover:bg-earth-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" style={{ color: 'rgb(var(--color-text-secondary))' }} />
          </button>
        </div>

        {confirmationSent ? (
          <div className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
            <p>Check your email to confirm your account before signing in.</p>
            <button onClick={onClose} className="btn-primary text-sm mt-4 w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-sm border"
                style={{
                  backgroundColor: 'rgb(var(--color-bg-primary))',
                  borderColor: 'rgb(var(--color-border-primary))',
                  color: 'rgb(var(--color-text-primary))',
                }}
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-sm border"
                style={{
                  backgroundColor: 'rgb(var(--color-bg-primary))',
                  borderColor: 'rgb(var(--color-border-primary))',
                  color: 'rgb(var(--color-text-primary))',
                }}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button type="submit" disabled={submitting} className="btn-primary text-sm w-full disabled:opacity-60">
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>

            <p className="text-xs text-center" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
              {mode === 'signin' ? (
                <>
                  Don't have an account?{' '}
                  <button type="button" onClick={() => setMode('signup')} className="text-accent-500 hover:underline">
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button type="button" onClick={() => setMode('signin')} className="text-accent-500 hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
