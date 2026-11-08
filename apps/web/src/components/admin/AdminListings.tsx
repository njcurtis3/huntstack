import { useState } from 'react'
import {
  AdminApiError,
  useAdminOutfitters,
  useReleaseOutfitter,
  useSetOutfitterActive,
  type AdminListing,
} from '../../lib/adminApi'

const muted = { color: 'rgb(var(--color-text-secondary))' }
const danger = { color: 'rgb(var(--color-danger, 207 34 46))' }

type Pending = 'toggle' | 'release' | null

function statusText(listing: AdminListing): string {
  return `${listing.isActive ? 'Visible' : 'Hidden'}${listing.isVerified ? ', verified' : ''}${
    listing.ownerId ? `, owner ${listing.ownerId}` : ', unclaimed'
  }`
}

/** Hide/Show and Release, each behind an in-page confirm step. */
function Actions({ listing }: { listing: AdminListing }) {
  const setActive = useSetOutfitterActive()
  const release = useReleaseOutfitter()
  const [pending, setPending] = useState<Pending>(null)
  const busy = setActive.isPending || release.isPending
  const error = setActive.error ?? release.error
  const errorText = error instanceof AdminApiError ? error.message : error ? 'Something went wrong. Please try again.' : null

  function confirm() {
    if (pending === 'toggle') setActive.mutate({ id: listing.id, isActive: !listing.isActive }, { onSettled: () => setPending(null) })
    if (pending === 'release') release.mutate({ id: listing.id }, { onSettled: () => setPending(null) })
  }

  if (pending) {
    const question =
      pending === 'toggle'
        ? `${listing.isActive ? 'Hide' : 'Show'} ${listing.name} ${listing.isActive ? 'from' : 'in'} the public directory?`
        : `Release the owner of ${listing.name}? They will lose access to its dashboard.`
    return (
      <div>
        <p className="text-base mb-2 break-words" style={{ color: 'rgb(var(--color-text-primary))' }}>{question}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary min-h-[44px] text-base" disabled={busy} onClick={confirm}>
            {busy ? 'Working...' : 'Confirm'}
          </button>
          <button type="button" className="btn-outline min-h-[44px] text-base" disabled={busy} onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {errorText && <p role="alert" className="text-base mb-2" style={danger}>{errorText}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-secondary min-h-[44px] text-base" onClick={() => setPending('toggle')}>
          {listing.isActive ? 'Hide' : 'Show'}
        </button>
        {listing.ownerId && (
          <button type="button" className="btn-outline min-h-[44px] text-base" onClick={() => setPending('release')}>
            Release owner
          </button>
        )}
      </div>
    </div>
  )
}

export function AdminListings({ userId }: { userId: string }) {
  const { data, isLoading, error } = useAdminOutfitters(userId, true)

  if (isLoading) return <p className="text-base" style={muted}>Loading listings...</p>
  if (error) {
    return (
      <p role="alert" className="text-base" style={danger}>
        {error instanceof AdminApiError ? error.message : 'Could not load listings.'}
      </p>
    )
  }
  if (!data || data.length === 0) return <p className="text-base" style={muted}>No listings.</p>

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {data.map(listing => (
          <li key={listing.id} className="card p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold break-words" style={{ color: 'rgb(var(--color-text-primary))' }}>
                {listing.name}
              </h3>
              <span className="text-sm" style={muted}>{listing.city}, {listing.state}</span>
            </div>
            <p className="text-sm mt-1 mb-3 break-words" style={muted}>{statusText(listing)}</p>
            <Actions listing={listing} />
          </li>
        ))}
      </ul>

      <table className="hidden md:table w-full text-left text-base">
        <thead>
          <tr style={muted}>
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Location</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map(listing => (
            <tr key={listing.id} className="border-t align-top" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
              <td className="py-3 pr-4 break-words" style={{ color: 'rgb(var(--color-text-primary))' }}>{listing.name}</td>
              <td className="py-3 pr-4" style={muted}>{listing.city}, {listing.state}</td>
              <td className="py-3 pr-4 break-all" style={muted}>{statusText(listing)}</td>
              <td className="py-3"><Actions listing={listing} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
