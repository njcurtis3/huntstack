/**
 * The state guides as plain HTML, written into dist at build time (prerender/statePages.ts) so
 * a search engine that doesn't run JavaScript still reads the page. React replaces it on load
 * with StateGuidePage, which renders the same Guide with the same classes.
 *
 * Lives under src/ so Tailwind sees its class names. No browser or Node APIs.
 */

import {
  GUIDE_STATES,
  formatLimit,
  formatRange,
  guidePath,
  guideQuestion,
  guideSummary,
  longDate,
  seasonLabel,
  shortDate,
  type Guide,
} from './stateGuide'

const muted = 'color: rgb(var(--color-text-tertiary))'
const border = 'border-color: rgb(var(--color-border-primary))'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function link(href: string, text: string, cls = 'underline'): string {
  const external = /^https?:/.test(href)
  return `<a href="${esc(href)}" class="${cls}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(text)}</a>`
}

function otherStates(current?: string): string {
  return `<ul class="flex flex-wrap gap-2">${GUIDE_STATES.filter(s => s.code !== current)
    .map(s => `<li>${link(guidePath(s), s.name, 'btn-secondary text-sm')}</li>`).join('')}</ul>`
}

export function renderGuideHtml(g: Guide): string {
  const name = g.state.name
  const out: string[] = []
  out.push(`<article class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">`)
  out.push(`<nav aria-label="Breadcrumb" class="text-sm mb-4" style="${muted}">${link('/', 'Home', 'hover:underline')} / ${link('/duck-hunting', 'State guides', 'hover:underline')} / ${esc(name)}</nav>`)
  out.push(`<h1 class="text-3xl sm:text-4xl font-semibold tracking-tight">${esc(name)} duck and goose hunting, ${seasonLabel(g.seasonYear)}</h1>`)
  out.push(`<p class="mt-3 text-base" style="${muted}">${esc(guideSummary(g))}</p>`)
  out.push(`<p class="mt-4 flex flex-wrap gap-2">${[
    link(`/migration?state=${g.state.code}`, `Migration in ${name}`, 'btn-primary text-sm'),
    link(`/regulations/${g.state.code}`, `${name} regulations`, 'btn-outline text-sm'),
    link('/where-to-hunt', 'Where to hunt', 'btn-outline text-sm'),
    link(`/chat?q=${encodeURIComponent(guideQuestion(g.state))}`, 'Ask AI', 'btn-outline text-sm'),
  ].join('')}</p>`)

  // Counts
  out.push(`<section class="mt-10" aria-labelledby="guide-counts"><h2 id="guide-counts" class="text-xl font-semibold">Bird counts in ${esc(name)}</h2>`)
  const c = g.counts
  if (!c) {
    out.push(`<p class="mt-2 text-sm" style="${muted}">No survey counts or eBird reports for ${esc(name)} right now.</p>`)
  } else {
    out.push(`<p class="mt-2 text-sm" style="${muted}">${c.allStale
      ? `No count in the last few weeks. The newest numbers, from ${esc(longDate(c.latestDate))}:`
      : `Refuge and agency surveys plus eBird reports, latest ${esc(longDate(c.latestDate))}.`}</p>`)
    out.push(`<div class="grid grid-cols-2 gap-3 mt-4">
<div class="card p-4"><p class="text-sm" style="${muted}">Ducks and geese counted</p><p class="text-2xl font-bold">${c.totalBirds.toLocaleString('en-US')}</p></div>
<div class="card p-4"><p class="text-sm" style="${muted}">Places counted</p><p class="text-2xl font-bold">${c.siteCount}</p></div>
</div>`)
    out.push(`<div class="overflow-x-auto mt-4"><table class="w-full text-sm"><thead><tr class="border-b" style="${border}">
<th scope="col" class="text-left font-medium py-2 pr-3" style="${muted}">Place</th>
<th scope="col" class="text-right font-medium py-2 pr-3" style="${muted}">Birds</th>
<th scope="col" class="text-right font-medium py-2" style="${muted}">Latest</th></tr></thead><tbody>`)
    for (const s of c.sites) {
      out.push(`<tr class="border-b" style="${border}"><th scope="row" class="text-left font-medium py-2 pr-3">${esc(s.name)}${s.ebird ? ` <span class="text-xs font-normal" style="${muted}">eBird reports</span>` : ''}</th><td class="text-right py-2 pr-3 tabular-nums">${s.total.toLocaleString('en-US')}</td><td class="text-right py-2 tabular-nums whitespace-nowrap">${esc(shortDate(s.latestDate))}</td></tr>`)
    }
    out.push(`</tbody></table></div>`)
    if (c.species.length > 0) {
      out.push(`<p class="mt-3 text-sm"><span style="${muted}">Most counted:</span> ${c.species.map(s => `${esc(s.name)} ${s.count.toLocaleString('en-US')}`).join(' · ')}</p>`)
    }
  }
  out.push(`</section>`)

  // Seasons
  out.push(`<section class="mt-10" aria-labelledby="guide-seasons"><h2 id="guide-seasons" class="text-xl font-semibold">${esc(name)} waterfowl seasons and bag limits, ${seasonLabel(g.seasonYear)}</h2>`)
  if (g.sections.length === 0) {
    out.push(`<p class="mt-2 text-sm" style="${muted}">This season's dates aren't loaded yet.</p>`)
  }
  for (const sec of g.sections) {
    out.push(`<h3 class="mt-6 text-base font-semibold">${esc(sec.category)}</h3><div class="overflow-x-auto mt-2"><table class="w-full text-sm"><thead><tr class="border-b" style="${border}">
<th scope="col" class="text-left font-medium py-2 pr-3" style="${muted}">Season</th>
<th scope="col" class="text-left font-medium py-2 pr-3" style="${muted}">Zone</th>
<th scope="col" class="text-left font-medium py-2 pr-3" style="${muted}">Dates</th>
<th scope="col" class="text-right font-medium py-2" style="${muted}">Daily limit</th></tr></thead><tbody>`)
    for (const r of sec.rows) {
      out.push(`<tr class="border-b align-top" style="${border}"><th scope="row" class="text-left font-medium py-2 pr-3">${esc(r.name)}${r.openToday ? ' <span class="ml-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-forest-100 text-forest-800 dark:bg-forest-900/40 dark:text-forest-300">Open</span>' : ''}</th><td class="py-2 pr-3">${esc(r.zone)}</td><td class="py-2 pr-3 tabular-nums whitespace-nowrap">${r.ranges.map(x => esc(formatRange(x))).join('<br>')}</td><td class="text-right py-2 tabular-nums">${esc(formatLimit(r))}</td></tr>`)
    }
    out.push(`</tbody></table></div>`)
  }
  out.push(`<p class="mt-4 text-xs" style="${muted}">From ${g.sourceUrl ? link(g.sourceUrl, g.agencyName ?? `${name}'s wildlife agency`) : esc(g.agencyName ?? `${name}'s wildlife agency`)}. Daily limits are the most of that group in one day; species sub-limits, shooting hours and license rules are in ${link(`/regulations/${g.state.code}`, `${name} regulations`)}. Check the agency's current rules before you hunt.</p>`)
  out.push(`</section>`)

  out.push(`<section class="mt-10" aria-labelledby="guide-more"><h2 id="guide-more" class="text-xl font-semibold">Other states</h2><div class="mt-3">${otherStates(g.state.code)}</div></section>`)
  out.push(`</article>`)
  return out.join('\n')
}

export const INDEX_TITLE = 'Duck & Goose Hunting by State: Seasons, Limits & Bird Counts'
export const INDEX_DESCRIPTION =
  'Waterfowl season dates, zones and bag limits with the latest refuge counts and eBird reports for Arkansas, Illinois, Iowa, Kansas, Louisiana, Missouri, New Mexico, Oklahoma and Texas.'

export function renderIndexHtml(): string {
  return `<article class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
<nav aria-label="Breadcrumb" class="text-sm mb-4" style="${muted}">${link('/', 'Home', 'hover:underline')} / State guides</nav>
<h1 class="text-3xl sm:text-4xl font-semibold tracking-tight">Duck and goose hunting by state</h1>
<p class="mt-3 text-base" style="${muted}">${esc(INDEX_DESCRIPTION)}</p>
<div class="mt-6">${otherStates()}</div>
</article>`
}
