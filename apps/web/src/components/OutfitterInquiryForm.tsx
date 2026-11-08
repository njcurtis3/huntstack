import { useState, type FormEvent } from 'react'
import { sendOutfitterInquiry, type InquiryInput } from '../lib/outfitterInquiry'

interface OutfitterInquiryFormProps {
  outfitterId: string
  outfitterName: string
}

const labelClass = 'block text-sm font-medium mb-1.5'
const fieldClass = 'input text-base min-h-11'

export function OutfitterInquiryForm({ outfitterId, outfitterName }: OutfitterInquiryFormProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredDates, setPreferredDates] = useState('')
  const [partySize, setPartySize] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const labelStyle = { color: 'rgb(var(--color-text-secondary))' }
  const trimmedMessage = message.trim()
  const messageOk = trimmedMessage.length >= 10 && trimmedMessage.length <= 2000

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!messageOk) {
      setError('Write a message of at least 10 characters.')
      return
    }
    const input: InquiryInput = { message: trimmedMessage }
    if (name.trim()) input.name = name.trim()
    if (phone.trim()) input.phone = phone.trim()
    if (preferredDates.trim()) input.preferredDates = preferredDates.trim()
    if (partySize.trim()) {
      const n = Number(partySize)
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        setError('Party size must be a whole number from 1 to 50.')
        return
      }
      input.partySize = n
    }

    setError(null)
    setSubmitting(true)
    try {
      await sendOutfitterInquiry(outfitterId, input)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="text-base" style={{ color: 'rgb(var(--color-text-primary))' }}>
        Message sent to {outfitterName}. They will reply to your account email.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="inq-name" className={labelClass} style={labelStyle}>Your name (optional)</label>
        <input
          id="inq-name"
          type="text"
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="inq-phone" className={labelClass} style={labelStyle}>Phone (optional)</label>
        <input
          id="inq-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={30}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="inq-dates" className={labelClass} style={labelStyle}>Preferred dates (optional)</label>
        <input
          id="inq-dates"
          type="text"
          maxLength={100}
          placeholder="e.g. mid-December"
          value={preferredDates}
          onChange={(e) => setPreferredDates(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="inq-party" className={labelClass} style={labelStyle}>Party size (optional)</label>
        <input
          id="inq-party"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={partySize}
          onChange={(e) => setPartySize(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="inq-message" className={labelClass} style={labelStyle}>Message</label>
        <textarea
          id="inq-message"
          required
          rows={5}
          minLength={10}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="input text-base"
        />
      </div>

      <p className="text-sm" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
        The outfitter will see your account email so they can reply.
      </p>

      {error && (
        <div role="alert" className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-base text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Sticky at the bottom on a phone, inline from md up. */}
      <div
        className="sticky bottom-0 -mx-4 px-4 pt-3 border-t md:static md:mx-0 md:px-0 md:pt-0 md:border-0 md:bg-transparent"
        style={{
          backgroundColor: 'rgb(var(--color-bg-elevated))',
          borderColor: 'rgb(var(--color-border-primary))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
      >
        <button type="submit" disabled={submitting} className="btn-primary w-full min-h-11 text-base disabled:opacity-60">
          {submitting ? 'Sending...' : 'Send message'}
        </button>
      </div>
    </form>
  )
}
