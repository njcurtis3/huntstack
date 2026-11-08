import { useMemo, useState, type FormEvent } from 'react'
import {
  EMAIL_PATTERN,
  PHONE_PATTERN,
  btnPrimary,
  btnSecondary,
  errorMessage,
  fieldClass,
  fieldStyle,
  labelClass,
  panelStyle,
  primaryText,
  secondaryText,
  stickyBarClass,
  stickyBarStyle,
  useClaimable,
  useSubmitClaim,
} from '../../lib/outfitterAccount'

interface ClaimFormProps {
  initialSlug: string | null
  onCancel: () => void
  onSubmitted: () => void
}

export function ClaimForm({ initialSlug, onCancel, onSubmitted }: ClaimFormProps) {
  const claimable = useClaimable()
  const [search, setSearch] = useState('')
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const mutation = useSubmitClaim()

  const listings = useMemo(() => claimable.data ?? [], [claimable.data])
  // ?claim=<slug> preselects until the person picks something else.
  const chosen =
    listings.find((l) => l.id === chosenId) ??
    (chosenId === null && initialSlug ? listings.find((l) => l.slug === initialSlug) : undefined) ??
    null

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return listings
    return listings.filter((l) => `${l.name} ${l.city} ${l.state}`.toLowerCase().includes(q))
  }, [listings, search])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const found: string[] = []
    if (!chosen) found.push('Choose the listing you want to claim.')
    const trimmedRole = role.trim()
    if (trimmedRole.length < 2 || trimmedRole.length > 80) found.push('Your role must be 2 to 80 characters.')
    if (phone.trim() && !PHONE_PATTERN.test(phone.trim())) {
      found.push('Phone must be 7 to 30 characters: digits, spaces and ( ) + - . only.')
    }
    if (email.trim() && (email.trim().length > 200 || !EMAIL_PATTERN.test(email.trim()))) {
      found.push('Enter a valid email address.')
    }
    if (note.length > 1000) found.push('Note can be up to 1000 characters.')
    setErrors(found)
    if (found.length > 0 || !chosen) return
    mutation.mutate(
      {
        outfitterId: chosen.id,
        role: trimmedRole,
        contactPhone: phone.trim() ? phone.trim() : null,
        contactEmail: email.trim() ? email.trim() : null,
        note: note.trim(),
      },
      { onSuccess: onSubmitted },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <p className="text-base" style={secondaryText}>
        Tell us how you're connected to the business. Nothing changes until HuntStack reviews your claim.
      </p>

      <div>
        <label htmlFor="cf-search" className={labelClass} style={primaryText}>Find your listing</label>
        <input id="cf-search" type="search" inputMode="search" enterKeyHint="search" value={search}
          onChange={(e) => setSearch(e.target.value)} placeholder="Business name or city"
          className={fieldClass} style={fieldStyle} />
      </div>

      {claimable.isLoading && <p className="text-base" style={secondaryText}>Loading listings...</p>}
      {claimable.error && <p role="alert" className="text-base text-red-600">{errorMessage(claimable.error)}</p>}
      {claimable.data && listings.length === 0 && (
        <p className="text-base" style={secondaryText}>
          Every listing has an owner already. If yours is missing, add it as a new business instead.
        </p>
      )}

      {listings.length > 0 && (
        <ul className="space-y-2 max-h-80 overflow-y-auto" aria-label="Listings you can claim">
          {visible.map((l) => (
            <li key={l.id}>
              <button type="button" aria-pressed={chosen?.id === l.id} onClick={() => setChosenId(l.id)}
                className={`w-full min-h-11 text-left px-4 py-2 rounded-md border text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                  chosen?.id === l.id ? 'border-accent-500 ring-2 ring-accent-500' : ''
                }`}
                style={panelStyle}>
                <span className="font-medium" style={primaryText}>{l.name}</span>
                <span className="block text-sm" style={secondaryText}>{l.city}, {l.state}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="text-base" style={secondaryText}>No listing matches that search.</li>}
        </ul>
      )}

      {chosen && (
        <p className="text-base" style={primaryText}>
          Claiming: <strong>{chosen.name}</strong> ({chosen.city}, {chosen.state})
        </p>
      )}

      <div>
        <label htmlFor="cf-role" className={labelClass} style={primaryText}>Your role at the business</label>
        <input id="cf-role" type="text" maxLength={80} value={role} onChange={(e) => setRole(e.target.value)}
          placeholder="Owner, manager, head guide..." className={fieldClass} style={fieldStyle} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-phone" className={labelClass} style={primaryText}>Phone (optional)</label>
          <input id="cf-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone}
            onChange={(e) => setPhone(e.target.value)} className={fieldClass} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="cf-email" className={labelClass} style={primaryText}>Business email (optional)</label>
          <input id="cf-email" type="email" inputMode="email" autoComplete="email" maxLength={200} value={email}
            onChange={(e) => setEmail(e.target.value)} className={fieldClass} style={fieldStyle} />
        </div>
      </div>

      <div>
        <label htmlFor="cf-note" className={labelClass} style={primaryText}>Anything we should know (optional)</label>
        <textarea id="cf-note" rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
          className={fieldClass} style={fieldStyle} />
      </div>

      {(errors.length > 0 || mutation.error) && (
        <div role="alert" className="rounded-md border border-red-500 p-3 text-base text-red-600">
          {errors.map((m) => <p key={m}>{m}</p>)}
          {mutation.error && <p>{errorMessage(mutation.error)}</p>}
        </div>
      )}

      <div className={stickyBarClass} style={stickyBarStyle}>
        <button type="submit" disabled={mutation.isPending} className={btnPrimary}>
          {mutation.isPending ? 'Submitting...' : 'Submit claim for review'}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
      </div>
    </form>
  )
}
