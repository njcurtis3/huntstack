import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Store } from 'lucide-react'
import { AuthModal } from '../components/AuthModal'
import { ClaimForm } from '../components/outfitter/ClaimForm'
import { ListingForm } from '../components/outfitter/ListingForm'
import { useAuthStore } from '../stores/authStore'
import {
  btnPrimary,
  btnSecondary,
  errorMessage,
  isSignInError,
  panelStyle,
  primaryText,
  secondaryText,
  useClearPrivateDataOnUserChange,
  useMyOutfitter,
} from '../lib/outfitterAccount'

type Mode = 'choose' | 'claim' | 'new'

export function ListBusinessPage() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const [searchParams] = useSearchParams()
  const claimSlug = searchParams.get('claim')
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null)
  const [mode, setMode] = useState<Mode>(claimSlug ? 'claim' : 'choose')
  useClearPrivateDataOnUserChange()
  const me = useMyOutfitter(isAuthenticated)

  const header = (
    <div className="mb-6">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: 'rgb(var(--color-bg-elevated))' }}
      >
        <Store className="w-6 h-6 text-accent-500" />
      </div>
      <h1 className="text-2xl font-bold mb-2" style={primaryText}>List Your Business</h1>
      <p className="text-base" style={secondaryText}>
        Get your outfitting business into the{' '}
        <Link to="/outfitters" className="text-accent-500 underline">Outfitter Directory</Link>. Claim a listing that
        is already there, or add a new one. Nothing goes live until HuntStack reviews it.
      </p>
    </div>
  )

  let body
  if (isLoading) {
    body = <p className="text-base" style={secondaryText}>Loading...</p>
  } else if (!isAuthenticated) {
    body = (
      <div className="rounded-lg border p-4" style={panelStyle}>
        <p className="text-base mb-4" style={primaryText}>
          Sign in or create an account to claim or add a listing. You'll manage it from your dashboard afterwards.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className={btnPrimary} onClick={() => setAuthMode('signin')}>Sign in</button>
          <button type="button" className={btnSecondary} onClick={() => setAuthMode('signup')}>Create account</button>
        </div>
      </div>
    )
  } else if (me.isLoading) {
    body = <p className="text-base" style={secondaryText}>Checking your account...</p>
  } else if (me.error) {
    body = (
      <div role="alert" className="rounded-lg border border-red-500 p-4">
        <p className="text-base text-red-600 mb-3">{errorMessage(me.error)}</p>
        {isSignInError(me.error) ? (
          <button type="button" className={btnPrimary} onClick={() => setAuthMode('signin')}>Sign in</button>
        ) : (
          <button type="button" className={btnSecondary} onClick={() => void me.refetch()}>Try again</button>
        )}
      </div>
    )
  } else if (me.data?.listing) {
    body = (
      <div className="rounded-lg border p-4" style={panelStyle}>
        <p className="text-base mb-4" style={primaryText}>
          You manage <strong>{me.data.listing.name}</strong>. Edit it from your dashboard.
        </p>
        <Link to="/outfitters/dashboard" className={`${btnPrimary} inline-flex items-center justify-center`}>
          Go to dashboard
        </Link>
      </div>
    )
  } else if (me.data?.pending) {
    const kindText = me.data.pending.kind === 'claim' ? 'claim' : 'new listing'
    body = (
      <div className="rounded-lg border p-4" style={panelStyle}>
        <p className="text-base mb-4" style={primaryText}>
          Your {kindText} is waiting for review. It is not live yet. You'll see the decision on your dashboard.
        </p>
        <Link to="/outfitters/dashboard" className={`${btnPrimary} inline-flex items-center justify-center`}>
          Go to dashboard
        </Link>
      </div>
    )
  } else {
    const rejected = me.data?.lastDecision?.status === 'rejected' ? me.data.lastDecision : null
    body = (
      <div className="space-y-5">
        {rejected && rejected.kind !== 'edit' && (
          <div role="status" className="rounded-lg border border-red-500 p-4">
            <p className="text-base font-medium text-red-600">
              Your last {rejected.kind === 'claim' ? 'claim' : 'listing'} was not approved.
            </p>
            {rejected.rejectReason && (
              <p className="text-base mt-1" style={primaryText}>Reason: {rejected.rejectReason}</p>
            )}
            <p className="text-base mt-1" style={secondaryText}>You can fix it and submit again below.</p>
          </div>
        )}
        {mode === 'choose' && (
          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" onClick={() => setMode('claim')}
              className="text-left rounded-lg border p-4 min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              style={panelStyle}>
              <span className="block text-lg font-semibold" style={primaryText}>Claim an existing listing</span>
              <span className="block text-base mt-1" style={secondaryText}>
                Your business is already in the directory and you want to manage it.
              </span>
            </button>
            <button type="button" onClick={() => setMode('new')}
              className="text-left rounded-lg border p-4 min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              style={panelStyle}>
              <span className="block text-lg font-semibold" style={primaryText}>Add a new business</span>
              <span className="block text-base mt-1" style={secondaryText}>
                You're not in the directory yet. Tell us about your outfit.
              </span>
            </button>
          </div>
        )}
        {mode === 'claim' && (
          <ClaimForm initialSlug={claimSlug} onCancel={() => setMode('choose')} onSubmitted={() => setMode('choose')} />
        )}
        {mode === 'new' && (
          <ListingForm kind="new_listing" initial={null} onCancel={() => setMode('choose')}
            onSubmitted={() => setMode('choose')} />
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
      {header}
      {body}
      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} />}
    </div>
  )
}
