import { useState, type FormEvent } from 'react'
import { Star } from 'lucide-react'
import {
  btnPrimary,
  btnSecondary,
  errorMessage,
  fieldClass,
  fieldStyle,
  labelClass,
  panelStyle,
  primaryText,
  secondaryText,
  useMyReviews,
  useReplyToReview,
  type MyReview,
} from '../../lib/outfitterAccount'

function ReviewItem({ review }: { review: MyReview }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState(review.pendingReply?.body ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const mutation = useReplyToReview()
  const fieldId = `reply-${review.id}`

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = body.trim()
    if (trimmed.length < 1 || trimmed.length > 1500) {
      setLocalError('A reply must be 1 to 1500 characters.')
      return
    }
    setLocalError(null)
    mutation.mutate({ reviewId: review.id, body: trimmed }, { onSuccess: () => setOpen(false) })
  }

  return (
    <li className="rounded-lg border p-4" style={panelStyle}>
      <div className="flex items-center gap-2" style={primaryText}>
        <span className="flex" role="img" aria-label={`${review.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-5 h-5 ${n <= review.rating ? 'text-amber-500 fill-amber-500' : ''}`} />
          ))}
        </span>
        <span className="text-sm" style={secondaryText}>{new Date(review.createdAt).toLocaleDateString()}</span>
      </div>
      {review.title && <p className="text-base font-semibold mt-2 break-words" style={primaryText}>{review.title}</p>}
      {review.content && <p className="text-base mt-1 whitespace-pre-line break-words" style={primaryText}>{review.content}</p>}
      {review.huntDate && <p className="text-sm mt-1" style={secondaryText}>Hunted: {review.huntDate}</p>}

      {review.reply && (
        <div className="mt-3 border-l-4 pl-3" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
          <p className="text-sm font-medium" style={secondaryText}>Your reply (live)</p>
          <p className="text-base whitespace-pre-line break-words" style={primaryText}>{review.reply.body}</p>
        </div>
      )}

      {review.pendingReply && (
        <div className="mt-3 border-l-4 border-amber-500 pl-3">
          <p className="text-sm font-medium" style={secondaryText}>
            Waiting for review - not shown to hunters yet
            {review.reply ? ' (your live reply above has not changed)' : ''}
          </p>
          <p className="text-base whitespace-pre-line break-words" style={primaryText}>{review.pendingReply.body}</p>
        </div>
      )}

      {open ? (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2" noValidate>
          <label htmlFor={fieldId} className={labelClass} style={primaryText}>Your reply</label>
          <textarea id={fieldId} rows={4} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)}
            className={fieldClass} style={fieldStyle} />
          <p className="text-sm" style={secondaryText}>
            Replies are reviewed by HuntStack before they appear. {body.trim().length} / 1500
          </p>
          {(localError || mutation.error) && (
            <p role="alert" className="text-base text-red-600">{localError ?? errorMessage(mutation.error)}</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" className={btnPrimary} disabled={mutation.isPending}>
              {mutation.isPending ? 'Sending...' : 'Send reply for review'}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className={`${btnSecondary} mt-3 w-full sm:w-auto`} onClick={() => setOpen(true)}>
          {review.reply || review.pendingReply ? 'Write a new reply' : 'Reply'}
        </button>
      )}
    </li>
  )
}

export function DashboardReviews() {
  const reviews = useMyReviews(true)

  if (reviews.isLoading) return <p className="text-base" style={secondaryText}>Loading...</p>
  if (reviews.error) return <p role="alert" className="text-base text-red-600">{errorMessage(reviews.error)}</p>

  const list = reviews.data?.reviews ?? []
  if (list.length === 0) {
    return (
      <p className="text-base" style={primaryText}>
        No reviews yet. Hunters can't post reviews on HuntStack yet - when they can, they'll show up here and you can reply.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {list.map((review) => <ReviewItem key={review.id} review={review} />)}
    </ul>
  )
}
