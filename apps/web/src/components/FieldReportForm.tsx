import { lazy, Suspense, useState, type FormEvent } from 'react'
import { Check, Loader2, LocateFixed, MapPin } from 'lucide-react'
import {
  ACTIVITIES,
  COUNT_BUCKETS,
  SPECIES_OPTIONS,
  useSubmitFieldReport,
  type Activity,
  type CountBucket,
  type FieldReportInput,
} from '../lib/fieldReports'

// MapLibre is heavy; it loads only when a hunter chooses to pick a spot on the map.
const LocationPickerMap = lazy(() => import('./LocationPickerMap'))

const hasMapKey = Boolean(import.meta.env.VITE_MAPTILER_KEY)

const HOUR_MS = 60 * 60 * 1000
const MAX_AGE_MS = 72 * HOUR_MS

interface FieldReportFormProps {
  onClose: () => void
}

type Point = { lat: number; lng: number }

/** Format a Date the way <input type="datetime-local"> expects, in local time. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function chipClass(selected: boolean): string {
  return `min-h-12 px-3 py-2 rounded-md border text-base font-medium text-left transition-colors ${
    selected
      ? 'bg-accent-600 border-accent-600 text-white'
      : 'text-earth-800 dark:text-earth-200 hover:bg-accent-50 dark:hover:bg-accent-900/20'
  }`
}

export function FieldReportForm({ onClose }: FieldReportFormProps) {
  const submit = useSubmitFieldReport()

  // Computed once when the form opens; these bound the time picker.
  const [now] = useState(() => new Date())
  const minObserved = toLocalInputValue(new Date(now.getTime() - MAX_AGE_MS + 60 * 1000))
  const maxObserved = toLocalInputValue(now)

  const [point, setPoint] = useState<Point | null>(null)
  const [locating, setLocating] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [speciesKey, setSpeciesKey] = useState<string | null>(null)
  const [bucket, setBucket] = useState<CountBucket | null>(null)
  const [countExact, setCountExact] = useState('')
  const [activity, setActivity] = useState<Activity | null>(null)
  const [observedLocal, setObservedLocal] = useState(maxObserved)
  const [formError, setFormError] = useState<string | null>(null)

  const useMyLocation = () => {
    setLocationError(null)
    if (!navigator.geolocation) {
      setLocationError('This browser cannot share your location. Pick a spot on the map instead.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Allow it in your browser, or pick a spot on the map.'
            : 'Could not get your location. Try again, or pick a spot on the map.'
        )
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const species = SPECIES_OPTIONS.find((s) => s.key === speciesKey)
    const bucketInfo = COUNT_BUCKETS.find((b) => b.value === bucket)
    if (!point) return setFormError('Set where you saw the birds.')
    if (!species) return setFormError('Choose what you saw.')
    if (!bucketInfo) return setFormError('Choose roughly how many.')

    let exact: number | undefined
    if (countExact.trim() !== '') {
      exact = Number(countExact)
      if (!Number.isInteger(exact) || exact < bucketInfo.min || exact > bucketInfo.max) {
        return setFormError(`The exact count must be a whole number from ${bucketInfo.min} to ${bucketInfo.max}.`)
      }
    }

    const observed = new Date(observedLocal)
    if (Number.isNaN(observed.getTime())) return setFormError('Enter when you saw them.')
    if (observed.getTime() < Date.now() - MAX_AGE_MS) {
      return setFormError('Reports can be up to 3 days old. Pick a more recent time.')
    }
    // The picker's max is the time the form opened, so a later "now" is never in the future.
    const observedAt = (observed.getTime() > Date.now() ? new Date() : observed).toISOString()

    const input: FieldReportInput = {
      lat: point.lat,
      lng: point.lng,
      birdGroup: species.birdGroup,
      speciesSlug: species.speciesSlug,
      countBucket: bucketInfo.value,
      observedAt,
      ...(exact !== undefined ? { countExact: exact } : {}),
      ...(activity ? { activity } : {}),
    }
    submit.mutate(input)
  }

  if (submit.isSuccess) {
    return (
      <div className="flex flex-col items-center text-center gap-4 px-4 py-10">
        <div className="w-12 h-12 rounded-full bg-accent-600 text-white flex items-center justify-center">
          <Check className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold" style={{ color: 'rgb(var(--color-text-primary))' }}>
          Report sent
        </h3>
        <p className="text-base max-w-prose" style={{ color: 'rgb(var(--color-text-secondary))' }}>
          Thanks. Other hunters will see it rounded to about 3 miles, labeled as an unverified hunter report.
        </p>
        <button type="button" onClick={onClose} className="btn-primary min-h-12 px-6 text-base">
          Done
        </button>
      </div>
    )
  }

  const labelClass = 'block text-base font-semibold mb-2'
  const labelStyle = { color: 'rgb(var(--color-text-primary))' }
  const errorText = formError ?? (submit.isError ? submit.error.message : null)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 md:px-6 md:grid md:grid-cols-2 md:gap-8 md:items-start space-y-6 md:space-y-0">
        {/* Where and when */}
        <div className="space-y-6">
          <fieldset>
            <legend className={labelClass} style={labelStyle}>
              Where did you see them?
            </legend>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="btn-outline min-h-12 text-base inline-flex items-center justify-center gap-2"
              >
                {locating ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
                {locating ? 'Finding you...' : 'Use my location'}
              </button>
              {hasMapKey && (
                <button
                  type="button"
                  onClick={() => setShowPicker((v) => !v)}
                  aria-expanded={showPicker}
                  className="btn-outline min-h-12 text-base inline-flex items-center justify-center gap-2"
                >
                  <MapPin className="w-5 h-5" />
                  {showPicker ? 'Hide map' : 'Pick on map'}
                </button>
              )}
            </div>
            {locationError && (
              <p role="alert" className="mt-2 text-base text-red-600 dark:text-red-400">
                {locationError}
              </p>
            )}
            {point && (
              <p className="mt-2 text-base" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                Spot set: {point.lat.toFixed(3)}, {point.lng.toFixed(3)}
              </p>
            )}
            <p className="mt-2 text-sm" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
              Your exact spot is never shown; others see it rounded to about 3 miles.
            </p>
            {showPicker && hasMapKey && (
              <div className="mt-3">
                <Suspense
                  fallback={
                    <div className="w-full h-64 md:h-72 flex items-center justify-center text-base" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                      Loading map...
                    </div>
                  }
                >
                  <LocationPickerMap value={point} onChange={setPoint} />
                </Suspense>
                <p className="mt-2 text-sm" style={{ color: 'rgb(var(--color-text-tertiary))' }}>
                  Tap the map to drop the pin.
                </p>
              </div>
            )}
          </fieldset>

          <div>
            <label htmlFor="field-report-observed" className={labelClass} style={labelStyle}>
              When?
            </label>
            <input
              id="field-report-observed"
              type="datetime-local"
              value={observedLocal}
              min={minObserved}
              max={maxObserved}
              onChange={(e) => setObservedLocal(e.target.value)}
              required
              className="w-full min-h-12 px-3 py-2 rounded-md border text-base"
              style={{
                backgroundColor: 'rgb(var(--color-bg-elevated))',
                borderColor: 'rgb(var(--color-border-primary))',
                color: 'rgb(var(--color-text-primary))',
              }}
            />
          </div>
        </div>

        {/* What */}
        <div className="space-y-6">
          <fieldset>
            <legend className={labelClass} style={labelStyle}>
              What did you see?
            </legend>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SPECIES_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={speciesKey === s.key}
                  onClick={() => setSpeciesKey(s.key)}
                  className={chipClass(speciesKey === s.key)}
                  style={speciesKey === s.key ? undefined : { borderColor: 'rgb(var(--color-border-primary))' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={labelClass} style={labelStyle}>
              About how many?
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {COUNT_BUCKETS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  aria-pressed={bucket === b.value}
                  onClick={() => setBucket(b.value)}
                  className={chipClass(bucket === b.value)}
                  style={bucket === b.value ? undefined : { borderColor: 'rgb(var(--color-border-primary))' }}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <label htmlFor="field-report-exact" className="block text-base mt-3 mb-2" style={{ color: 'rgb(var(--color-text-secondary))' }}>
              Exact count (optional)
            </label>
            <input
              id="field-report-exact"
              type="number"
              inputMode="numeric"
              min={1}
              max={250000}
              step={1}
              value={countExact}
              onChange={(e) => setCountExact(e.target.value)}
              className="w-full min-h-12 px-3 py-2 rounded-md border text-base"
              style={{
                backgroundColor: 'rgb(var(--color-bg-elevated))',
                borderColor: 'rgb(var(--color-border-primary))',
                color: 'rgb(var(--color-text-primary))',
              }}
            />
          </fieldset>

          <fieldset>
            <legend className={labelClass} style={labelStyle}>
              What were they doing? (optional)
            </legend>
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  aria-pressed={activity === a.value}
                  onClick={() => setActivity(activity === a.value ? null : a.value)}
                  className={chipClass(activity === a.value)}
                  style={activity === a.value ? undefined : { borderColor: 'rgb(var(--color-border-primary))' }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      {/* Sticky submit: always in the thumb zone at the bottom of the sheet */}
      <div
        className="shrink-0 border-t px-4 py-3 md:px-6"
        style={{
          borderColor: 'rgb(var(--color-border-primary))',
          backgroundColor: 'rgb(var(--color-bg-elevated))',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        {errorText && (
          <p role="alert" className="mb-2 text-base text-red-600 dark:text-red-400">
            {errorText}
          </p>
        )}
        <button
          type="submit"
          disabled={submit.isPending}
          className="btn-primary w-full min-h-12 text-base inline-flex items-center justify-center gap-2"
        >
          {submit.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
          {submit.isPending ? 'Sending...' : 'Send report'}
        </button>
      </div>
    </form>
  )
}
