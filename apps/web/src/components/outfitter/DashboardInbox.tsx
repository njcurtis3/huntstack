import { useState } from 'react'
import {
  btnSecondary,
  errorMessage,
  panelStyle,
  primaryText,
  secondaryText,
  useMyInquiries,
  useSetInquiryStatus,
  type InquiryStatus,
} from '../../lib/outfitterAccount'

const FILTERS: { value: InquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' },
]

export function DashboardInbox() {
  const [filter, setFilter] = useState<InquiryStatus>('new')
  const inquiries = useMyInquiries(filter, true)
  const setStatus = useSetInquiryStatus()

  return (
    <div className="space-y-4">
      <p className="text-base" style={secondaryText}>
        HuntStack doesn't email you about new inquiries yet - check here.
      </p>

      <div role="group" aria-label="Inquiry filter" className="flex gap-2">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}
            className={`flex-1 md:flex-none min-h-11 px-5 rounded-md border text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              filter === f.value ? 'bg-accent-500 text-white border-accent-500' : ''
            }`}
            style={filter === f.value ? undefined : { ...panelStyle, color: 'rgb(var(--color-text-primary))' }}>
            {f.label}
          </button>
        ))}
      </div>

      {inquiries.isLoading && <p className="text-base" style={secondaryText}>Loading...</p>}
      {inquiries.error && <p role="alert" className="text-base text-red-600">{errorMessage(inquiries.error)}</p>}
      {setStatus.error && <p role="alert" className="text-base text-red-600">{errorMessage(setStatus.error)}</p>}

      {inquiries.data && inquiries.data.inquiries.length === 0 && (
        <p className="text-base" style={primaryText}>
          {filter === 'new' ? 'No new inquiries.' : `No ${filter} inquiries.`}
        </p>
      )}

      <ul className="space-y-3">
        {inquiries.data?.inquiries.map((q) => (
          <li key={q.id} className="rounded-lg border p-4" style={panelStyle}>
            <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
              <p className="text-base font-semibold" style={primaryText}>{q.hunterName ?? 'A hunter'}</p>
              <p className="text-sm" style={secondaryText}>{new Date(q.createdAt).toLocaleString()}</p>
            </div>
            <p className="text-base break-words">
              <a href={`mailto:${encodeURIComponent(q.hunterEmail)}`} className="text-accent-500 underline inline-flex items-center min-h-11">
                {q.hunterEmail}
              </a>
            </p>
            {q.hunterPhone && (
              <p className="text-base">
                <a href={`tel:${encodeURIComponent(q.hunterPhone)}`} className="text-accent-500 underline inline-flex items-center min-h-11">
                  {q.hunterPhone}
                </a>
              </p>
            )}
            {(q.preferredDates || q.partySize !== null) && (
              <p className="text-base" style={secondaryText}>
                {q.preferredDates && <>Dates: {q.preferredDates}</>}
                {q.preferredDates && q.partySize !== null && ' - '}
                {q.partySize !== null && <>Party of {q.partySize}</>}
              </p>
            )}
            <p className="text-base mt-2 whitespace-pre-line break-words" style={primaryText}>{q.message}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {q.status === 'new' && (
                <button type="button" className={btnSecondary} disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: q.id, status: 'read' })}>
                  Mark read
                </button>
              )}
              {q.status !== 'archived' && (
                <button type="button" className={btnSecondary} disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: q.id, status: 'archived' })}>
                  Archive
                </button>
              )}
              {q.status === 'archived' && (
                <button type="button" className={btnSecondary} disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: q.id, status: 'new' })}>
                  Move back to New
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
