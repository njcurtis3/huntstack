import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export type AuthMode = 'signin' | 'signup' | 'reset' | 'newpassword'

interface AuthModalProps {
  mode: AuthMode
  onClose: () => void
}

const TITLES: Record<AuthMode, string> = {
  signin: 'Sign In',
  signup: 'Create Account',
  reset: 'Reset Password',
  newpassword: 'Choose a New Password',
}

export function AuthModal({ mode: initialMode, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Set after a step that ends in "check your email" or "done"
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const { login, register, requestPasswordReset, setNewPassword } = useAuthStore()
  const dialogRef = useRef<HTMLDivElement>(null)
  // The parent passes a new function each render; read the latest without re-running the effect
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Escape closes; focus moves into the box and returns to where it was when it closes
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('input, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await login(email, password)
        onClose()
      } else if (mode === 'signup') {
        await register(email, password)
        setDoneMessage('Check your email to confirm your account before signing in.')
      } else if (mode === 'reset') {
        await requestPasswordReset(email)
        // Same message whether or not the address has an account
        setDoneMessage('If that email has an account, a link to reset the password is on its way. Open it on this device.')
      } else {
        await setNewPassword(password)
        setDoneMessage('Your password is changed and you are signed in.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const showEmail = mode !== 'newpassword'
  const showPassword = mode !== 'reset'
  const submitLabel = { signin: 'Sign In', signup: 'Sign Up', reset: 'Send Reset Link', newpassword: 'Save Password' }[mode]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(11, 12, 13, 0.6)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="w-full max-w-sm rounded-lg shadow-2xl border"
        style={{ backgroundColor: 'rgb(var(--color-bg-elevated))', borderColor: 'rgb(var(--color-border-primary))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
          <h2 id="auth-title" className="text-lg font-semibold" style={{ color: 'rgb(var(--color-text-primary))' }}>
            {TITLES[mode]}
          </h2>
          <button
            onClick={onClose}
            className="p-2 -m-1 rounded-md hover:bg-earth-100 dark:hover:bg-earth-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" style={{ color: 'rgb(var(--color-text-secondary))' }} />
          </button>
        </div>

        {doneMessage ? (
          <div className="text-sm p-5" style={{ color: 'rgb(var(--color-text-secondary))' }}>
            <p role="status">{doneMessage}</p>
            <button onClick={onClose} className="btn-primary text-sm mt-4 w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 p-5">
            {mode === 'reset' && (
              <p className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                Enter your account email and we'll send a link to choose a new password.
              </p>
            )}
            {showEmail && (
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
                  className="input"
                />
              </div>
            )}
            {showPassword && (
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <label htmlFor="auth-password" className="block text-xs font-medium" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                    {mode === 'newpassword' ? 'New password' : 'Password'}
                  </label>
                  {mode === 'signin' && (
                    <button type="button" onClick={() => switchMode('reset')} className="text-xs text-accent-500 hover:underline py-1">
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                />
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button type="submit" disabled={submitting} className="btn-primary text-sm w-full disabled:opacity-60">
              {submitting ? 'Please wait…' : submitLabel}
            </button>

            {mode !== 'newpassword' && (
              <p className="text-xs text-center" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                {mode === 'signup' ? (
                  <>
                    Already have an account?{' '}
                    <button type="button" onClick={() => switchMode('signin')} className="text-accent-500 hover:underline py-1">
                      Sign in
                    </button>
                  </>
                ) : mode === 'reset' ? (
                  <button type="button" onClick={() => switchMode('signin')} className="text-accent-500 hover:underline py-1">
                    Back to sign in
                  </button>
                ) : (
                  <>
                    Don't have an account?{' '}
                    <button type="button" onClick={() => switchMode('signup')} className="text-accent-500 hover:underline py-1">
                      Sign up
                    </button>
                  </>
                )}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
