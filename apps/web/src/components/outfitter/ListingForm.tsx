import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import {
  HUNT_TYPE_OPTIONS,
  PHONE_PATTERN,
  PRICE_RANGES,
  STATE_CODES,
  btnPrimary,
  btnSecondary,
  errorMessage,
  fieldClass,
  fieldStyle,
  labelClass,
  primaryText,
  secondaryText,
  stickyBarClass,
  stickyBarStyle,
  useSubmitListing,
  type ListingInput,
} from '../../lib/outfitterAccount'

interface ListingFormProps {
  kind: 'new_listing' | 'edit'
  initial: ListingInput | null
  onCancel: () => void
  onSubmitted: () => void
}

const EMPTY: ListingInput = {
  name: '',
  city: '',
  state: 'TX',
  statesServed: ['TX'],
  huntTypes: [],
  speciesOffered: [],
  priceRange: '$$',
  priceNote: null,
  description: '',
  phone: null,
  website: null,
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Mirrors the server's validateListingInput; the server message is still shown verbatim on a 400. */
function validate(v: ListingInput): string[] {
  const errors: string[] = []
  const name = v.name.trim()
  if (name.length < 2 || name.length > 120) errors.push('Business name must be 2 to 120 characters.')
  const city = v.city.trim()
  if (city.length < 1 || city.length > 80) errors.push('City is required (up to 80 characters).')
  if (v.statesServed.length < 1) errors.push('Pick at least one state you serve.')
  if (!v.statesServed.includes(v.state)) errors.push('States served must include your home state.')
  if (v.huntTypes.length < 1) errors.push('Pick at least one hunt type.')
  if (v.speciesOffered.length < 1) errors.push('Add at least one species.')
  if (v.speciesOffered.length > 20) errors.push('Up to 20 species.')
  if ((v.priceNote ?? '').length > 120) errors.push('Price note can be up to 120 characters.')
  const description = v.description.trim()
  if (description.length < 20 || description.length > 2000) errors.push('Description must be 20 to 2000 characters.')
  if (v.phone !== null && !PHONE_PATTERN.test(v.phone)) {
    errors.push('Phone must be 7 to 30 characters: digits, spaces and ( ) + - . only.')
  }
  if (v.website !== null && (v.website.length > 200 || !isHttpUrl(v.website))) {
    errors.push('Website must be a full http:// or https:// address of at most 200 characters.')
  }
  return errors
}

export function ListingForm({ kind, initial, onCancel, onSubmitted }: ListingFormProps) {
  const start = initial ?? EMPTY
  const [name, setName] = useState(start.name)
  const [city, setCity] = useState(start.city)
  const [state, setState] = useState(start.state)
  const [statesServed, setStatesServed] = useState(start.statesServed)
  const [huntTypes, setHuntTypes] = useState(start.huntTypes)
  const [species, setSpecies] = useState(start.speciesOffered)
  const [speciesDraft, setSpeciesDraft] = useState('')
  const [priceRange, setPriceRange] = useState(start.priceRange)
  const [priceNote, setPriceNote] = useState(start.priceNote ?? '')
  const [description, setDescription] = useState(start.description)
  const [phone, setPhone] = useState(start.phone ?? '')
  const [website, setWebsite] = useState(start.website ?? '')
  const [errors, setErrors] = useState<string[]>([])
  const mutation = useSubmitListing()

  const addSpecies = () => {
    const value = speciesDraft.trim().slice(0, 40)
    if (!value) return
    if (!species.some((s) => s.toLowerCase() === value.toLowerCase())) setSpecies([...species, value])
    setSpeciesDraft('')
  }

  const onSpeciesKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSpecies()
    }
  }

  const changeState = (next: string) => {
    setState(next)
    if (!statesServed.includes(next)) setStatesServed([...statesServed, next])
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    // A species typed but not yet added still counts.
    const pending = speciesDraft.trim().slice(0, 40)
    const finalSpecies =
      pending && !species.some((s) => s.toLowerCase() === pending.toLowerCase()) ? [...species, pending] : species
    const listing: ListingInput = {
      name: name.trim(),
      city: city.trim(),
      state,
      statesServed,
      huntTypes,
      speciesOffered: finalSpecies,
      priceRange,
      priceNote: priceNote.trim() ? priceNote.trim() : null,
      description: description.trim(),
      phone: phone.trim() ? phone.trim() : null,
      website: website.trim() ? website.trim() : null,
    }
    const found = validate(listing)
    setErrors(found)
    if (found.length > 0) return
    mutation.mutate({ kind, listing }, { onSuccess: onSubmitted })
  }

  const chip = (active: boolean) =>
    `inline-flex items-center justify-center min-h-11 px-4 rounded-full border text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
      active ? 'bg-accent-500 text-white border-accent-500' : ''
    }`
  const chipStyle = (active: boolean) => (active ? undefined : { ...fieldStyle })

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <p className="text-base" style={secondaryText}>
        Nothing goes live until HuntStack reviews it.
      </p>

      <div>
        <label htmlFor="lf-name" className={labelClass} style={primaryText}>Business name</label>
        <input id="lf-name" type="text" autoComplete="organization" maxLength={120} value={name}
          onChange={(e) => setName(e.target.value)} className={fieldClass} style={fieldStyle} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-city" className={labelClass} style={primaryText}>City</label>
          <input id="lf-city" type="text" autoComplete="address-level2" maxLength={80} value={city}
            onChange={(e) => setCity(e.target.value)} className={fieldClass} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="lf-state" className={labelClass} style={primaryText}>Home state</label>
          <select id="lf-state" value={state} onChange={(e) => changeState(e.target.value)}
            className={fieldClass} style={fieldStyle}>
            {STATE_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className={labelClass} style={primaryText}>States you serve</legend>
        <div className="flex flex-wrap gap-2">
          {STATE_CODES.map((code) => (
            <button key={code} type="button" aria-pressed={statesServed.includes(code)}
              disabled={code === state}
              onClick={() => setStatesServed(toggle(statesServed, code))}
              className={chip(statesServed.includes(code))} style={chipStyle(statesServed.includes(code))}>
              {code}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelClass} style={primaryText}>Hunt types</legend>
        <div className="flex flex-wrap gap-2">
          {HUNT_TYPE_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" aria-pressed={huntTypes.includes(opt.value)}
              onClick={() => setHuntTypes(toggle(huntTypes, opt.value))}
              className={chip(huntTypes.includes(opt.value))} style={chipStyle(huntTypes.includes(opt.value))}>
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="lf-species" className={labelClass} style={primaryText}>Species you offer</label>
        {species.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-2">
            {species.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => setSpecies(species.filter((x) => x !== s))}
                  aria-label={`Remove ${s}`}
                  className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full border text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  style={fieldStyle}>
                  {s}
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input id="lf-species" type="text" enterKeyHint="done" maxLength={40} value={speciesDraft}
            onChange={(e) => setSpeciesDraft(e.target.value)} onKeyDown={onSpeciesKey}
            placeholder="e.g. Mallard" className={fieldClass} style={fieldStyle} />
          <button type="button" onClick={addSpecies} className={`${btnSecondary} shrink-0`}>Add</button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-price" className={labelClass} style={primaryText}>Price range</label>
          <select id="lf-price" value={priceRange} onChange={(e) => setPriceRange(e.target.value)}
            className={fieldClass} style={fieldStyle}>
            {PRICE_RANGES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="lf-pricenote" className={labelClass} style={primaryText}>Price note (optional)</label>
          <input id="lf-pricenote" type="text" maxLength={120} value={priceNote}
            onChange={(e) => setPriceNote(e.target.value)} className={fieldClass} style={fieldStyle} />
        </div>
      </div>

      <div>
        <label htmlFor="lf-desc" className={labelClass} style={primaryText}>Description</label>
        <textarea id="lf-desc" rows={6} maxLength={2000} value={description}
          onChange={(e) => setDescription(e.target.value)} className={fieldClass} style={fieldStyle} />
        <p className="text-sm mt-1" style={secondaryText}>{description.trim().length} / 2000 (at least 20)</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-phone" className={labelClass} style={primaryText}>Phone (optional)</label>
          <input id="lf-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone}
            onChange={(e) => setPhone(e.target.value)} className={fieldClass} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="lf-web" className={labelClass} style={primaryText}>Website (optional)</label>
          <input id="lf-web" type="url" inputMode="url" autoComplete="url" maxLength={200} value={website}
            onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={fieldClass} style={fieldStyle} />
        </div>
      </div>

      {(errors.length > 0 || mutation.error) && (
        <div role="alert" className="rounded-md border border-red-500 p-3 text-base text-red-600">
          {errors.map((m) => <p key={m}>{m}</p>)}
          {mutation.error && <p>{errorMessage(mutation.error)}</p>}
        </div>
      )}

      <div className={stickyBarClass} style={stickyBarStyle}>
        <button type="submit" disabled={mutation.isPending} className={btnPrimary}>
          {mutation.isPending ? 'Submitting...' : kind === 'edit' ? 'Submit changes for review' : 'Submit for review'}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
      </div>
    </form>
  )
}
