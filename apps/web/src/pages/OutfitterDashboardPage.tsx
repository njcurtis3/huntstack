import { useState } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { AuthModal } from '../components/AuthModal'
import { DashboardInbox } from '../components/outfitter/DashboardInbox'
import { DashboardListing } from '../components/outfitter/DashboardListing'
import { DashboardReviews } from '../components/outfitter/DashboardReviews'
import { DashboardStats } from '../components/outfitter/DashboardStats'
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
  useRefetchMyOutfitterAfterSignIn,
  useMyInquiries,
  useMyOutfitter,
} from '../lib/outfitterAccount'

type Tab = 'listing' | 'views' | 'reviews' | 'inbox'

export function OutfitterDashboardPage() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null)
  const [tab, setTab] = useState<Tab>('listing')
  useClearPrivateDataOnUserChange()
  const me = useMyOutfitter(isAuthenticated)
  const refetchAfterSignIn = useRefetchMyOutfitterAfterSignIn()
  const hasListing = Boolean(me.data?.listing)
  // Same query key as the inbox's default filter, so the badge and the list share one request.
  const newInquiries = useMyInquiries('new', hasListing)
  const unread = newInquiries.data?.unread ?? 0

  const heading = (
    <div className="flex items-center gap-3 mb-6">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'rgb(var(--color-bg-elevated))' }}
      >
        <LayoutDashboard className="w-6 h-6 text-accent-500" />
      </div>
      <h1 className="text-2xl font-bold" style={primaryText}>Outfitter Dashboard</h1>
    </div>
  )

  let body
  if (isLoading) {
    body = <p className="text-base" style={secondaryText}>Loading...</p>
  } else if (!isAuthenticated) {
    body = (
      <div className="rounded-lg border p-4 max-w-xl" style={panelStyle}>
        <p className="text-base mb-4" style={primaryText}>
          Sign in to manage your listing, see how often it's viewed, reply to reviews and read inquiries.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className={btnPrimary} onClick={() => setAuthMode('signin')}>Sign in</button>
          <button type="button" className={btnSecondary} onClick={() => setAuthMode('signup')}>Create account</button>
        </div>
      </div>
    )
  } else if (me.isLoading) {
    body = <p className="text-base" style={secondaryText}>Loading your listing...</p>
  } else if (me.error || !me.data) {
    body = (
      <div role="alert" className="rounded-lg border border-red-500 p-4 max-w-xl">
        <p className="text-base text-red-600 mb-3">{errorMessage(me.error)}</p>
        {isSignInError(me.error) ? (
          <button type="button" className={btnPrimary} onClick={() => setAuthMode('signin')}>Sign in</button>
        ) : (
          <button type="button" className={btnSecondary} onClick={() => void me.refetch()}>Try again</button>
        )}
      </div>
    )
  } else if (!me.data.listing) {
    // No live listing yet: only the Listing panel is meaningful (pending, rejected, or a prompt).
    body = <div className="max-w-3xl"><DashboardListing data={me.data} /></div>
  } else {
    const tabs: { id: Tab; label: string; badge?: number }[] = [
      { id: 'listing', label: 'Listing' },
      { id: 'views', label: 'Views' },
      { id: 'reviews', label: 'Reviews' },
      { id: 'inbox', label: 'Inbox', badge: unread },
    ]
    body = (
      <div className="md:grid md:grid-cols-[14rem_1fr] md:gap-8">
        <div role="tablist" aria-label="Dashboard sections"
          className="flex gap-2 overflow-x-auto pb-2 mb-4 md:flex-col md:overflow-visible md:pb-0 md:mb-0 md:self-start">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}
              className={`shrink-0 inline-flex items-center justify-center md:justify-start gap-2 min-h-11 px-5 rounded-full md:rounded-md border text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                tab === t.id ? 'bg-accent-500 text-white border-accent-500' : ''
              }`}
              style={tab === t.id ? undefined : { ...panelStyle, color: 'rgb(var(--color-text-primary))' }}>
              {t.label}
              {t.badge ? (
                <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-red-600 text-white text-sm"
                  aria-label={`${t.badge} unread`}>
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-w-0 max-w-4xl">
          {tab === 'listing' && <DashboardListing data={me.data} />}
          {tab === 'views' && <DashboardStats />}
          {tab === 'reviews' && <DashboardReviews />}
          {tab === 'inbox' && <DashboardInbox />}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
      {heading}
      {body}
      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => {
            setAuthMode(null)
            refetchAfterSignIn()
          }}
        />
      )}
    </div>
  )
}
