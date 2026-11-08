import { useState } from 'react'
import { NotFoundPage } from './NotFoundPage'
import { SubmissionCard } from '../components/admin/SubmissionCard'
import { AdminListings } from '../components/admin/AdminListings'
import { AdminApiError, useAdminMe, useAdminSubmissions, type SubmissionFilter } from '../lib/adminApi'

type Tab = 'queue' | 'history' | 'listings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'queue', label: 'Queue' },
  { id: 'history', label: 'History' },
  { id: 'listings', label: 'Listings' },
]

const muted = { color: 'rgb(var(--color-text-secondary))' }

function SubmissionList({ status, enabled }: { status: SubmissionFilter; enabled: boolean }) {
  const { data, isLoading, error } = useAdminSubmissions(status, enabled)

  if (isLoading) return <p className="text-base" style={muted}>Loading...</p>
  if (error) {
    return (
      <p role="alert" className="text-base" style={{ color: 'rgb(var(--color-danger, 207 34 46))' }}>
        {error instanceof AdminApiError ? error.message : 'Could not load submissions.'}
      </p>
    )
  }
  if (!data || data.length === 0) {
    return <p className="text-base" style={muted}>{status === 'pending' ? 'Nothing waiting for review.' : 'No decided submissions yet.'}</p>
  }
  return (
    <div className="space-y-4">
      {data.map(s => (
        <SubmissionCard key={s.id} submission={s} decided={status === 'decided'} />
      ))}
    </div>
  )
}

/**
 * Owner-only review page. Not linked from anywhere. Anyone who is not an admin sees the
 * standard Not Found page; that is cosmetic, the API answers 403 to every non-admin call.
 */
export function AdminPage() {
  const me = useAdminMe()
  const [tab, setTab] = useState<Tab>('queue')

  if (me.isLoading) {
    return <div className="max-w-7xl mx-auto px-4 py-8"><p className="text-base" style={muted}>Loading...</p></div>
  }
  if (me.error || !me.data?.isAdmin) return <NotFoundPage />

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8">
      <h1 className="text-2xl font-bold mb-4" style={{ color: 'rgb(var(--color-text-primary))' }}>Admin</h1>

      <div role="tablist" className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${tab === t.id ? 'btn-primary' : 'btn-secondary'} min-h-[44px] text-base`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'queue' && <SubmissionList status="pending" enabled />}
      {tab === 'history' && <SubmissionList status="decided" enabled />}
      {tab === 'listings' && <AdminListings enabled />}
    </div>
  )
}
