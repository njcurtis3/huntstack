import {
  AdminApiError,
  useAdminOutfitters,
  useReleaseOutfitter,
  useSetOutfitterActive,
  type AdminListing,
} from '../../lib/adminApi'

const muted = { color: 'rgb(var(--color-text-secondary))' }

function ListingRow({ listing }: { listing: AdminListing }) {
  const setActive = useSetOutfitterActive()
  const release = useReleaseOutfitter()
  const busy = setActive.isPending || release.isPending
  const error = setActive.error ?? release.error
  const errorText = error instanceof AdminApiError ? error.message : error ? 'Something went wrong. Please try again.' : null

  function onRelease() {
    if (window.confirm(`Release the owner of ${listing.name}? They will lose access to its dashboard.`)) {
      release.mutate({ id: listing.id })
    }
  }

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold break-words" style={{ color: 'rgb(var(--color-text-primary))' }}>
          {listing.name}
        </h3>
        <span className="text-sm" style={muted}>{listing.city}, {listing.state}</span>
      </div>
      <p className="text-sm mt-1" style={muted}>
        {listing.isActive ? 'Visible' : 'Hidden'}
        {listing.isVerified ? ', verified' : ''}
        {listing.ownerId ? `, owner ${listing.ownerId}` : ', unclaimed'}
      </p>
      {errorText && <p role="alert" className="text-base mt-2" style={{ color: 'rgb(var(--color-danger, 207 34 46))' }}>{errorText}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn-secondary min-h-[44px] text-base"
          disabled={busy}
          onClick={() => setActive.mutate({ id: listing.id, isActive: !listing.isActive })}
        >
          {listing.isActive ? 'Hide' : 'Show'}
        </button>
        {listing.ownerId && (
          <button type="button" className="btn-outline min-h-[44px] text-base" disabled={busy} onClick={onRelease}>
            Release owner
          </button>
        )}
      </div>
    </li>
  )
}

export function AdminListings({ enabled }: { enabled: boolean }) {
  const { data, isLoading, error } = useAdminOutfitters(enabled)

  if (isLoading) return <p className="text-base" style={muted}>Loading listings...</p>
  if (error) {
    return (
      <p role="alert" className="text-base" style={{ color: 'rgb(var(--color-danger, 207 34 46))' }}>
        {error instanceof AdminApiError ? error.message : 'Could not load listings.'}
      </p>
    )
  }
  if (!data || data.length === 0) return <p className="text-base" style={muted}>No listings.</p>

  return (
    <ul className="space-y-3">
      {data.map(listing => (
        <ListingRow key={listing.id} listing={listing} />
      ))}
    </ul>
  )
}
