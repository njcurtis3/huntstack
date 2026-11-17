import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  GUIDE_STATES,
  buildGuide,
  formatLimit,
  formatRange,
  guidePath,
  guideQuestion,
  guideSeasonYear,
  guideStateBySlug,
  guideSummary,
  longDate,
  seasonLabel,
  shortDate,
  type Guide,
  type GuideState,
} from '../lib/stateGuide'
import { INDEX_DESCRIPTION } from '../lib/stateGuideHtml'
import { NotFoundPage } from './NotFoundPage'

// The same classes and structure as lib/stateGuideHtml.ts, which the build writes for search
// engines; keep the two alike so the page doesn't jump when React takes over.
const muted = { color: `rgb(var(--color-text-tertiary))` }
const border = { borderColor: `rgb(var(--color-border-primary))` }

/** The Guide the build embedded in this page's HTML, when it is for this state */
function embeddedGuide(slug: string): Guide | undefined {
  try {
    const el = document.getElementById('guide-data')
    if (!el?.textContent) return undefined
    const g = JSON.parse(el.textContent) as Guide
    return g.state?.slug === slug ? g : undefined
  } catch {
    return undefined
  }
}

function OtherStates({ current }: { current?: string }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {GUIDE_STATES.filter(s => s.code !== current).map(s => (
        <li key={s.code}><Link to={guidePath(s)} className="btn-secondary text-sm">{s.name}</Link></li>
      ))}
    </ul>
  )
}

export function StateGuideIndexPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm mb-4" style={muted}>
        <Link to="/" className="hover:underline">Home</Link> / State guides
      </nav>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Duck and goose hunting by state</h1>
      <p className="mt-3 text-base" style={muted}>{INDEX_DESCRIPTION}</p>
      <div className="mt-6"><OtherStates /></div>
    </article>
  )
}

export function StateGuidePage() {
  const { state: slug } = useParams()
  const state = guideStateBySlug(slug)
  if (!state) return <NotFoundPage />
  return <StateGuide key={state.code} state={state} />
}

function StateGuide({ state }: { state: GuideState }) {
  const embedded = embeddedGuide(state.slug)
  const { data: g, isError } = useQuery({
    queryKey: ['state-guide', state.code],
    queryFn: async () => {
      const now = new Date()
      const [seasons, states, dashboard] = await Promise.all([
        api.getStateSeasons(state.code, { year: guideSeasonYear(now) }),
        api.getStates().catch(() => null),
        api.getMigrationDashboard().catch(() => null),
      ])
      const info = states?.states.find(s => s.code === state.code) ?? null
      return buildGuide(state, info, seasons.seasons, dashboard, now)
    },
    initialData: embedded,
    // The build's copy can be a day old: show it at once, then refresh
    initialDataUpdatedAt: 0,
  })

  const name = state.name
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm mb-4" style={muted}>
        <Link to="/" className="hover:underline">Home</Link> / <Link to="/duck-hunting" className="hover:underline">State guides</Link> / {name}
      </nav>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
        {name} duck and goose hunting, {seasonLabel(g?.seasonYear ?? guideSeasonYear(new Date()))}
      </h1>
      {g && <p className="mt-3 text-base" style={muted}>{guideSummary(g)}</p>}
      <p className="mt-4 flex flex-wrap gap-2">
        <Link to={`/migration?state=${state.code}`} className="btn-primary text-sm">Migration in {name}</Link>
        <Link to={`/regulations/${state.code}`} className="btn-outline text-sm">{name} regulations</Link>
        <Link to="/where-to-hunt" className="btn-outline text-sm">Where to hunt</Link>
        <Link to={`/chat?q=${encodeURIComponent(guideQuestion(state))}`} className="btn-outline text-sm">Ask AI</Link>
      </p>

      {!g ? (
        <p className="mt-10 text-sm" style={muted}>
          {isError ? `Couldn't load ${name}'s seasons. Try again in a moment.` : 'Loading…'}
        </p>
      ) : (
        <>
          <Counts g={g} />
          <Seasons g={g} />
        </>
      )}

      <section className="mt-10" aria-labelledby="guide-more">
        <h2 id="guide-more" className="text-xl font-semibold">Other states</h2>
        <div className="mt-3"><OtherStates current={state.code} /></div>
      </section>
    </article>
  )
}

function Counts({ g }: { g: Guide }) {
  const c = g.counts
  const name = g.state.name
  return (
    <section className="mt-10" aria-labelledby="guide-counts">
      <h2 id="guide-counts" className="text-xl font-semibold">Bird counts in {name}</h2>
      {!c ? (
        <p className="mt-2 text-sm" style={muted}>No survey counts or eBird reports for {name} right now.</p>
      ) : (
        <>
          <p className="mt-2 text-sm" style={muted}>
            {c.allStale
              ? `No count in the last few weeks. The newest numbers, from ${longDate(c.latestDate)}:`
              : `Refuge and agency surveys plus eBird reports, latest ${longDate(c.latestDate)}.`}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="card p-4">
              <p className="text-sm" style={muted}>Ducks and geese counted</p>
              <p className="text-2xl font-bold">{c.totalBirds.toLocaleString('en-US')}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm" style={muted}>Places counted</p>
              <p className="text-2xl font-bold">{c.siteCount}</p>
            </div>
          </div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={border}>
                  <th scope="col" className="text-left font-medium py-2 pr-3" style={muted}>Place</th>
                  <th scope="col" className="text-right font-medium py-2 pr-3" style={muted}>Birds</th>
                  <th scope="col" className="text-right font-medium py-2" style={muted}>Latest</th>
                </tr>
              </thead>
              <tbody>
                {c.sites.map(s => (
                  <tr key={s.name} className="border-b" style={border}>
                    <th scope="row" className="text-left font-medium py-2 pr-3">
                      {s.name}
                      {s.ebird && <> <span className="text-xs font-normal" style={muted}>eBird reports</span></>}
                    </th>
                    <td className="text-right py-2 pr-3 tabular-nums">{s.total.toLocaleString('en-US')}</td>
                    <td className="text-right py-2 tabular-nums whitespace-nowrap">{shortDate(s.latestDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.species.length > 0 && (
            <p className="mt-3 text-sm">
              <span style={muted}>Most counted:</span>{' '}
              {c.species.map(s => `${s.name} ${s.count.toLocaleString('en-US')}`).join(' · ')}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function Seasons({ g }: { g: Guide }) {
  const name = g.state.name
  const agency = g.agencyName ?? `${name}'s wildlife agency`
  return (
    <section className="mt-10" aria-labelledby="guide-seasons">
      <h2 id="guide-seasons" className="text-xl font-semibold">
        {name} waterfowl seasons and bag limits, {seasonLabel(g.seasonYear)}
      </h2>
      {g.sections.length === 0 && (
        <p className="mt-2 text-sm" style={muted}>This season&rsquo;s dates aren&rsquo;t loaded yet.</p>
      )}
      {g.sections.map(sec => (
        <div key={sec.category}>
          <h3 className="mt-6 text-base font-semibold">{sec.category}</h3>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={border}>
                  <th scope="col" className="text-left font-medium py-2 pr-3" style={muted}>Season</th>
                  <th scope="col" className="text-left font-medium py-2 pr-3" style={muted}>Zone</th>
                  <th scope="col" className="text-left font-medium py-2 pr-3" style={muted}>Dates</th>
                  <th scope="col" className="text-right font-medium py-2" style={muted}>Daily limit</th>
                </tr>
              </thead>
              <tbody>
                {sec.rows.map(r => (
                  <tr key={`${r.name}|${r.zone}`} className="border-b align-top" style={border}>
                    <th scope="row" className="text-left font-medium py-2 pr-3">
                      {r.name}
                      {r.openToday && (
                        <> <span className="ml-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-forest-100 text-forest-800 dark:bg-forest-900/40 dark:text-forest-300">Open</span></>
                      )}
                    </th>
                    <td className="py-2 pr-3">{r.zone}</td>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                      {r.ranges.map((x, i) => <span key={i}>{i > 0 && <br />}{formatRange(x)}</span>)}
                    </td>
                    <td className="text-right py-2 tabular-nums">{formatLimit(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="mt-4 text-xs" style={muted}>
        From{' '}
        {g.sourceUrl ? <a href={g.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{agency}</a> : agency}.
        {' '}Daily limits are the most of that group in one day; species sub-limits, shooting hours and license rules are in{' '}
        <Link to={`/regulations/${g.state.code}`} className="underline">{name} regulations</Link>. Check the agency&rsquo;s current rules before you hunt.
      </p>
    </section>
  )
}
