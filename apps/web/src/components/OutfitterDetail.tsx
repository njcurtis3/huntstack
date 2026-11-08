import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapPin, BadgeCheck, Phone, Globe, ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { AuthModal } from './AuthModal'
import { OutfitterInquiryForm } from './OutfitterInquiryForm'

const PRICE_LABELS: Record<string, string> = {
  '$': 'Budget',
  '$$': 'Moderate',
  '$$$': 'Premium',
  '$$$$': 'Luxury',
}

const HUNT_TYPE_LABELS: Record<string, string> = {
  'guided': 'Fully Guided',
  'semi-guided': 'Semi-Guided',
  'diy-support': 'DIY Support',
}

const primary = { color: 'rgb(var(--color-text-primary))' }
const secondary = { color: 'rgb(var(--color-text-secondary))' }
const tertiary = { color: 'rgb(var(--color-text-tertiary))' }
const cardStyle = {
  backgroundColor: 'rgb(var(--color-bg-elevated))',
  borderColor: 'rgb(var(--color-border-primary))',
}
const linkClass =
  'inline-flex items-center gap-1.5 min-h-11 text-base text-accent-500 dark:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded'

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= Math.round(rating) ? 'text-yellow-400 fill-current' : 'text-earth-300 dark:text-earth-600'}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function OutfitterDetail({ idOrSlug }: { idOrSlug: string }) {
  const user = useAuthStore((s) => s.user)
  const [authOpen, setAuthOpen] = useState(false)

  const listingQuery = useQuery({
    queryKey: ['outfitter', idOrSlug],
    queryFn: () => api.getOutfitterById(idOrSlug),
    retry: false,
  })
  const reviewsQuery = useQuery({
    queryKey: ['outfitter', idOrSlug, 'reviews'],
    queryFn: () => api.getOutfitterReviews(idOrSlug),
    enabled: listingQuery.isSuccess,
    retry: false,
  })

  if (listingQuery.isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-base" style={secondary}>
        Loading listing...
      </div>
    )
  }

  const outfitter = listingQuery.data?.outfitter
  if (listingQuery.isError || !outfitter) {
    const notFound = listingQuery.error instanceof Error && /not found/i.test(listingQuery.error.message)
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-2" style={primary}>
          {notFound ? 'Listing not found' : 'Could not load this listing'}
        </h1>
        <p className="text-base mb-4" style={secondary}>
          {notFound ? 'It may have been removed or the link may be wrong.' : 'Please try again in a moment.'}
        </p>
        <Link to="/outfitters" className={linkClass}>
          <ArrowLeft className="w-4 h-4" />
          Back to the directory
        </Link>
      </div>
    )
  }

  const reviews = reviewsQuery.data?.reviews ?? []

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Link to="/outfitters" className={linkClass}>
        <ArrowLeft className="w-4 h-4" />
        All outfitters
      </Link>

      <div className="mt-2 md:grid md:grid-cols-3 md:gap-8">
        {/* Main column */}
        <div className="md:col-span-2 space-y-6">
          <header>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" style={primary}>{outfitter.name}</h1>
              {outfitter.isVerified && (
                <BadgeCheck className="w-5 h-5 text-accent-500 dark:text-accent-400 flex-shrink-0" aria-label="Verified" />
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-base" style={secondary}>
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>{outfitter.city}, {outfitter.state}</span>
            </div>
            <div className="mt-2 text-base">
              <span className="font-bold text-forest-500 dark:text-forest-400">{outfitter.priceRange}</span>
              <span className="ml-2" style={tertiary}>{PRICE_LABELS[outfitter.priceRange] ?? ''}</span>
              {outfitter.priceNote && <span className="ml-2" style={secondary}>{outfitter.priceNote}</span>}
            </div>
            {outfitter.rating != null && (
              <div className="flex items-center gap-2 mt-2">
                <Stars rating={outfitter.rating} />
                <span className="text-base font-semibold" style={primary}>{outfitter.rating.toFixed(1)}</span>
                <span className="text-sm" style={tertiary}>({outfitter.reviewCount} reviews)</span>
              </div>
            )}
          </header>

          <p className="text-base leading-relaxed" style={secondary}>{outfitter.description}</p>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {outfitter.statesServed.map((s) => (
                <span
                  key={s}
                  className="px-2 py-1 text-sm font-mono font-semibold rounded border"
                  style={{
                    backgroundColor: 'rgb(var(--color-bg-secondary))',
                    borderColor: 'rgb(var(--color-border-primary))',
                    color: 'rgb(var(--color-text-secondary))',
                  }}
                >
                  {s}
                </span>
              ))}
              {outfitter.huntTypes.map((ht) => (
                <span
                  key={ht}
                  className="px-2 py-1 text-sm rounded bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 border border-accent-200 dark:border-accent-800/50"
                >
                  {HUNT_TYPE_LABELS[ht] ?? ht}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {outfitter.speciesOffered.map((sp) => (
                <span
                  key={sp}
                  className="px-2 py-1 text-sm rounded bg-forest-50 dark:bg-forest-900/30 text-forest-700 dark:text-forest-400 border border-forest-200 dark:border-forest-800/50"
                >
                  {sp}
                </span>
              ))}
            </div>
          </div>

          {/* Reviews */}
          <section aria-labelledby="reviews-heading">
            <h2 id="reviews-heading" className="text-lg font-semibold mb-3" style={primary}>Reviews</h2>
            {reviewsQuery.isLoading ? (
              <p className="text-base" style={secondary}>Loading reviews...</p>
            ) : reviews.length === 0 ? (
              <p className="text-base" style={secondary}>No reviews yet.</p>
            ) : (
              <ul className="space-y-4">
                {reviews.map((r) => {
                  const posted = formatDate(r.createdAt)
                  const hunted = formatDate(r.huntDate)
                  return (
                    <li key={r.id} className="rounded-lg border p-4" style={cardStyle}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Stars rating={r.rating} />
                        {r.title && <span className="text-base font-semibold" style={primary}>{r.title}</span>}
                      </div>
                      {r.content && <p className="mt-2 text-base leading-relaxed" style={secondary}>{r.content}</p>}
                      {(posted || hunted) && (
                        <p className="mt-2 text-sm" style={tertiary}>
                          {hunted ? `Hunted ${hunted}` : ''}{hunted && posted ? ' · ' : ''}{posted ? `Posted ${posted}` : ''}
                        </p>
                      )}
                      {r.reply && (
                        <div className="mt-3 border-l-2 pl-3" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
                          <p className="text-sm font-semibold" style={primary}>Response from the outfitter</p>
                          <p className="mt-1 text-base leading-relaxed" style={secondary}>{r.reply.body}</p>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Contact / inquiry sidebar */}
        <aside className="mt-6 md:mt-0">
          <div className="rounded-lg border p-4 md:sticky md:top-4 space-y-4" style={cardStyle}>
            <h2 className="text-lg font-semibold" style={primary}>Contact</h2>
            <div className="flex flex-col gap-2">
              {outfitter.phone && (
                <a
                  href={`tel:${outfitter.phone}`}
                  onClick={() => api.recordContactClick(outfitter.id, 'call')}
                  className="btn-secondary w-full min-h-11 flex items-center justify-center gap-2 text-base"
                >
                  <Phone className="w-4 h-4" />
                  Call
                </a>
              )}
              {outfitter.website && (
                <a
                  href={outfitter.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => api.recordContactClick(outfitter.id, 'website')}
                  className="btn-secondary w-full min-h-11 flex items-center justify-center gap-2 text-base"
                >
                  <Globe className="w-4 h-4" />
                  Website
                </a>
              )}
              {!outfitter.phone && !outfitter.website && (
                <p className="text-base" style={tertiary}>Contact info coming soon</p>
              )}
            </div>

            <div className="border-t pt-4" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
              {outfitter.claimed ? (
                <>
                  <h3 className="text-base font-semibold mb-3" style={primary}>Message this outfitter</h3>
                  {user ? (
                    <OutfitterInquiryForm outfitterId={outfitter.id} outfitterName={outfitter.name} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAuthOpen(true)}
                      className="btn-primary w-full min-h-11 text-base"
                    >
                      Sign in to message this outfitter
                    </button>
                  )}
                </>
              ) : (
                <Link to={`/outfitters/list-your-business?claim=${encodeURIComponent(outfitter.slug)}`} className={linkClass}>
                  Is this your business?
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>

      {authOpen && <AuthModal mode="signin" onClose={() => setAuthOpen(false)} />}
    </div>
  )
}
