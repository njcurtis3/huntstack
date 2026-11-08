import { useState } from 'react'
import {
  AdminApiError,
  useApproveSubmission,
  useRejectSubmission,
  type AdminSubmission,
  type SubmissionKind,
} from '../../lib/adminApi'

const KIND_LABEL: Record<SubmissionKind, string> = {
  new_listing: 'New listing',
  edit: 'Edit',
  claim: 'Claim',
  review_reply: 'Review reply',
}

const LISTING_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'statesServed', label: 'States served' },
  { key: 'huntTypes', label: 'Hunt types' },
  { key: 'speciesOffered', label: 'Species' },
  { key: 'priceRange', label: 'Price range' },
  { key: 'priceNote', label: 'Price note' },
  { key: 'description', label: 'Description' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
]

const CLAIM_FIELDS: { key: string; label: string }[] = [
  { key: 'role', label: 'Role' },
  { key: 'contactPhone', label: 'Contact phone' },
  { key: 'contactEmail', label: 'Contact email' },
  { key: 'note', label: 'Note' },
]

/** Plain text for any value. React escapes it; nothing here is ever rendered as HTML. */
function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(none)'
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '(none)'
  return String(value)
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

const muted = { color: 'rgb(var(--color-text-secondary))' }

function Row({ label, current, proposed, changed }: { label: string; current?: unknown; proposed: unknown; changed?: boolean }) {
  const hasCurrent = current !== undefined
  return (
    <div className="py-2 border-b last:border-b-0" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
      <p className="text-sm font-medium" style={muted}>
        {label}
        {hasCurrent && changed && <span className="ml-2" style={{ color: 'rgb(var(--color-success))' }}>changed</span>}
      </p>
      <div className={hasCurrent ? 'grid grid-cols-1 gap-1 md:grid-cols-2 md:gap-4' : ''}>
        {hasCurrent && (
          <p className="text-base break-words" style={muted}>
            <span className="text-sm md:hidden">Current: </span>
            {show(current)}
          </p>
        )}
        <p
          className="text-base break-words whitespace-pre-wrap"
          style={{ color: 'rgb(var(--color-text-primary))', fontWeight: hasCurrent && changed ? 600 : undefined }}
        >
          {hasCurrent && <span className="text-sm md:hidden font-normal">Proposed: </span>}
          {show(proposed)}
        </p>
      </div>
    </div>
  )
}

export function SubmissionCard({ submission, decided = false }: { submission: AdminSubmission; decided?: boolean }) {
  const approve = useApproveSubmission()
  const reject = useRejectSubmission()
  const [markVerified, setMarkVerified] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const { kind, payload, current } = submission
  const busy = approve.isPending || reject.isPending
  const canVerify = kind === 'new_listing' || kind === 'claim'
  const reasonTrimmed = reason.trim()
  const reasonOk = reasonTrimmed.length >= 3 && reasonTrimmed.length <= 500
  const error = approve.error ?? reject.error
  const errorText = error instanceof AdminApiError ? error.message : error ? 'Something went wrong. Please try again.' : null

  function onApprove() {
    approve.mutate({ id: submission.id, markVerified: canVerify ? markVerified : undefined })
  }

  function onReject() {
    if (!reasonOk) return
    reject.mutate({ id: submission.id, reason: reasonTrimmed })
  }

  return (
    <article className="card p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold" style={{ color: 'rgb(var(--color-text-primary))' }}>
          {KIND_LABEL[kind]}
          {current ? `: ${current.name}` : kind === 'new_listing' ? `: ${show(payload.name)}` : ''}
        </h3>
        <span className="text-sm" style={muted}>{formatDate(submission.createdAt)}</span>
      </header>
      <p className="text-sm mb-2 break-words" style={muted}>
        From {submission.submitterEmail ?? 'unknown email'} ({submission.userId})
      </p>

      {kind === 'new_listing' && (
        <div>
          {LISTING_FIELDS.map(f => (
            <Row key={f.key} label={f.label} proposed={payload[f.key]} />
          ))}
        </div>
      )}

      {kind === 'edit' && (
        <div>
          {!current && <p className="text-base" style={muted}>The live listing could not be loaded.</p>}
          {LISTING_FIELDS.map(f => {
            const cur = current ? (current as unknown as Record<string, unknown>)[f.key] : null
            return (
              <Row
                key={f.key}
                label={f.label}
                current={cur}
                proposed={payload[f.key]}
                changed={!sameValue(cur, payload[f.key])}
              />
            )
          })}
        </div>
      )}

      {kind === 'claim' && (
        <div>
          {current && (
            <Row label="Listing" proposed={`${current.name} (${current.city}, ${current.state})`} />
          )}
          {CLAIM_FIELDS.map(f => (
            <Row key={f.key} label={f.label} proposed={payload[f.key]} />
          ))}
        </div>
      )}

      {kind === 'review_reply' && (
        <div>
          {current && <Row label="Listing" proposed={current.name} />}
          {submission.review && (
            <Row
              label="Review"
              proposed={`${submission.review.rating} of 5. ${[submission.review.title, submission.review.content]
                .filter(Boolean)
                .join(' - ')}`}
            />
          )}
          <Row label="Proposed reply" proposed={payload.body} />
        </div>
      )}

      {decided ? (
        <p className="mt-3 text-base" style={{ color: 'rgb(var(--color-text-primary))' }}>
          {submission.status}
          {submission.reviewedAt ? ` on ${formatDate(submission.reviewedAt)}` : ''}
          {submission.rejectReason ? `. Reason: ${submission.rejectReason}` : ''}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {canVerify && (
            <label className="flex items-center gap-3 min-h-[44px] text-base" style={{ color: 'rgb(var(--color-text-primary))' }}>
              <input
                type="checkbox"
                className="w-5 h-5"
                checked={markVerified}
                disabled={busy}
                onChange={e => setMarkVerified(e.target.checked)}
              />
              Mark verified
            </label>
          )}

          {rejecting && (
            <div>
              <label htmlFor={`reason-${submission.id}`} className="block text-sm font-medium mb-1" style={muted}>
                Reason for rejecting (required, 3 to 500 characters)
              </label>
              <textarea
                id={`reason-${submission.id}`}
                className="input text-base"
                rows={3}
                maxLength={500}
                value={reason}
                disabled={busy}
                onChange={e => setReason(e.target.value)}
              />
            </div>
          )}

          {errorText && <p role="alert" className="text-base" style={{ color: 'rgb(var(--color-danger, 207 34 46))' }}>{errorText}</p>}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-primary min-h-[44px] text-base" disabled={busy} onClick={onApprove}>
              {approve.isPending ? 'Approving...' : 'Approve'}
            </button>
            {rejecting ? (
              <>
                <button type="button" className="btn-secondary min-h-[44px] text-base" disabled={busy || !reasonOk} onClick={onReject}>
                  {reject.isPending ? 'Rejecting...' : 'Confirm reject'}
                </button>
                <button
                  type="button"
                  className="btn-outline min-h-[44px] text-base"
                  disabled={busy}
                  onClick={() => {
                    setRejecting(false)
                    setReason('')
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn-secondary min-h-[44px] text-base" disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
