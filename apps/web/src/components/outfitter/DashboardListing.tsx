import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListingForm } from './ListingForm'
import {
  HUNT_TYPE_OPTIONS,
  btnPrimary,
  btnSecondary,
  errorMessage,
  panelStyle,
  primaryText,
  secondaryText,
  useWithdraw,
  type ListingInput,
  type MyOutfitter,
  type Submission,
} from '../../lib/outfitterAccount'

function huntTypeLabel(value: string): string {
  return HUNT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

/** A submission payload is untyped JSON; fall back to empty values so a bad row cannot crash the page. */
function payloadToListing(payload: Record<string, unknown>): ListingInput {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    name: str(payload.name),
    city: str(payload.city),
    state: str(payload.state) || 'TX',
    statesServed: list(payload.statesServed),
    huntTypes: list(payload.huntTypes),
    speciesOffered: list(payload.speciesOffered),
    priceRange: str(payload.priceRange) || '$$',
    priceNote: strOrNull(payload.priceNote),
    description: str(payload.description),
    phone: strOrNull(payload.phone),
    website: strOrNull(payload.website),
  }
}

function Summary({ listing }: { listing: ListingInput }) {
  const rows: [string, string][] = [
    ['Name', listing.name],
    ['Location', `${listing.city}, ${listing.state}`],
    ['States served', listing.statesServed.join(', ')],
    ['Hunt types', listing.huntTypes.map(huntTypeLabel).join(', ')],
    ['Species', listing.speciesOffered.join(', ')],
    ['Price', `${listing.priceRange}${listing.priceNote ? ` - ${listing.priceNote}` : ''}`],
    ['Phone', listing.phone ?? 'Not listed'],
    ['Website', listing.website ?? 'Not listed'],
  ]
  return (
    <dl className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="md:grid md:grid-cols-[10rem_1fr] md:gap-4">
          <dt className="text-sm font-medium" style={secondaryText}>{label}</dt>
          <dd className="text-base break-words" style={primaryText}>{value}</dd>
        </div>
      ))}
      <div className="md:grid md:grid-cols-[10rem_1fr] md:gap-4">
        <dt className="text-sm font-medium" style={secondaryText}>Description</dt>
        <dd className="text-base whitespace-pre-line break-words" style={primaryText}>{listing.description}</dd>
      </div>
    </dl>
  )
}

function submissionKindText(s: Submission): string {
  if (s.kind === 'edit') return 'edit'
  if (s.kind === 'claim') return 'claim'
  return 'new listing'
}

export function DashboardListing({ data }: { data: MyOutfitter }) {
  const [editing, setEditing] = useState(false)
  const withdraw = useWithdraw()
  const { listing, pending, lastDecision } = data
  const rejected = !pending && lastDecision?.status === 'rejected' ? lastDecision : null

  // What the form starts from: the pending payload, else a rejected one, else the live listing.
  let formSource: ListingInput | null = null
  let formKind: 'new_listing' | 'edit' = listing ? 'edit' : 'new_listing'
  let formNote = ''
  if (pending && (pending.kind === 'edit' || pending.kind === 'new_listing')) {
    formSource = payloadToListing(pending.payload)
    formKind = pending.kind
    formNote = 'Starting from your pending submission. Saving replaces it.'
  } else if (rejected && (rejected.kind === 'edit' || rejected.kind === 'new_listing')) {
    formSource = payloadToListing(rejected.payload)
    formKind = rejected.kind
    formNote = 'Starting from the version that was not approved.'
  } else if (listing) {
    formSource = listing
  }
  const canEdit = formKind === 'edit' ? Boolean(listing) : !listing && (Boolean(rejected) || pending?.kind === 'new_listing')

  if (editing && canEdit) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold" style={primaryText}>
          {formKind === 'edit' ? 'Edit your listing' : 'Edit your new listing'}
        </h2>
        {formNote && <p className="text-base" style={secondaryText}>{formNote}</p>}
        <ListingForm kind={formKind} initial={formSource} onCancel={() => setEditing(false)}
          onSubmitted={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {pending && (
        <div role="status" className="rounded-lg border border-amber-500 p-4" style={panelStyle}>
          <p className="text-base font-medium" style={primaryText}>
            Waiting for review - your live listing has not changed
          </p>
          <p className="text-base mt-1" style={secondaryText}>
            Your {submissionKindText(pending)} was sent on {new Date(pending.createdAt).toLocaleDateString()}.
            {pending.kind === 'edit' && ' The details below are still what hunters see.'}
          </p>
          {pending.kind !== 'claim' && (
            <details className="mt-3">
              <summary className="min-h-11 flex items-center text-base cursor-pointer text-accent-500">
                See what you submitted (not live)
              </summary>
              <div className="mt-2"><Summary listing={payloadToListing(pending.payload)} /></div>
            </details>
          )}
          {pending.kind !== 'edit' && (
            <p className="text-base mt-2" style={secondaryText}>
              You can only have one {submissionKindText(pending)} waiting at a time. Withdraw it if you want to change it
              and submit again.
            </p>
          )}
          {withdraw.error && <p role="alert" className="text-base text-red-600 mt-2">{errorMessage(withdraw.error)}</p>}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" className={btnSecondary} disabled={withdraw.isPending}
              onClick={() => withdraw.mutate(pending.id)}>
              {withdraw.isPending ? 'Withdrawing...' : 'Withdraw'}
            </button>
            {pending.kind === 'edit' && canEdit && (
              <button type="button" className={btnPrimary} onClick={() => setEditing(true)}>Edit submission</button>
            )}
          </div>
        </div>
      )}

      {rejected && (
        <div role="status" className="rounded-lg border border-red-500 p-4" style={panelStyle}>
          <p className="text-base font-medium text-red-600">
            Your {submissionKindText(rejected)} was not approved
          </p>
          <p className="text-base mt-1" style={primaryText}>
            Reason: {rejected.rejectReason ?? 'No reason was recorded.'}
          </p>
          {rejected.kind === 'claim' ? (
            <Link to="/outfitters/list-your-business"
              className={`${btnPrimary} mt-3 inline-flex items-center justify-center`}>
              Submit a new claim
            </Link>
          ) : (
            canEdit && (
              <button type="button" className={`${btnPrimary} mt-3`} onClick={() => setEditing(true)}>
                Edit and resubmit
              </button>
            )
          )}
        </div>
      )}

      {listing ? (
        <section className="rounded-lg border p-4" style={panelStyle}>
          <div className="flex flex-col gap-1 mb-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-semibold" style={primaryText}>{listing.name}</h2>
            <span className="text-sm" style={secondaryText}>
              {listing.isActive
                ? `Live on HuntStack${listing.isVerified ? ' - verified' : ''}`
                : 'Hidden from the directory'}

            </span>
          </div>
          <Summary listing={listing} />
          {!pending && (
            <button type="button" className={`${btnPrimary} mt-4 w-full md:w-auto`} onClick={() => setEditing(true)}>
              Edit listing
            </button>
          )}
          {!pending && (
            <p className="text-base mt-3" style={secondaryText}>
              Changes you submit are reviewed by HuntStack before they appear.
            </p>
          )}
        </section>
      ) : (
        !pending && (
          <div className="rounded-lg border p-4" style={panelStyle}>
            <p className="text-base mb-3" style={primaryText}>You don't have a listing yet.</p>
            <Link to="/outfitters/list-your-business"
              className={`${btnPrimary} inline-flex items-center justify-center`}>
              List your business
            </Link>
          </div>
        )
      )}
    </div>
  )
}
