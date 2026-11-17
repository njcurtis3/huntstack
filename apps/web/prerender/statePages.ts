/**
 * Vite build plugin: writes the state guides (/duck-hunting and /duck-hunting/<state>) as
 * real HTML files into dist, so search engines read each state's dates, limits and counts
 * without running JavaScript, and adds them to sitemap.xml.
 *
 * Each file is dist/index.html with that page's title, description, canonical and Open Graph
 * tags, the guide's HTML inside #root, and the Guide as JSON for StateGuidePage to start from.
 * React replaces #root on load as on any other page.
 *
 * Files are dist/duck-hunting/<slug>.html, not <slug>/index.html: Cloudflare Pages serves
 * /duck-hunting/texas from texas.html with no trailing-slash redirect, so the address matches
 * the React route and the canonical. Paths with no file fall through to Pages' single-page
 * fallback (there is no 404.html and no _redirects catch-all, which would shadow these files).
 *
 * Data comes from the API at build time (VITE_API_URL). A state whose data can't be fetched
 * gets no file; the React page still serves it. The build never fails on this.
 */

import fs from 'node:fs'
import path from 'node:path'
import { loadEnv, type Plugin } from 'vite'
import {
  GUIDE_BASE,
  GUIDE_STATES,
  buildGuide,
  guidePath,
  guideSeasonYear,
  guideSummary,
  guideTitle,
  type DashboardInput,
  type SeasonInput,
  type StateInfoInput,
} from '../src/lib/stateGuide'
import { INDEX_DESCRIPTION, INDEX_TITLE, renderGuideHtml, renderIndexHtml } from '../src/lib/stateGuideHtml'

const SITE = 'https://huntstack.net'
const TIMEOUT_MS = 20_000

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`)
  return (await res.json()) as T
}

/** index.html with this page's head tags and body content */
export function fillTemplate(template: string, page: {
  path: string
  title: string
  description: string
  body: string
  data?: unknown
}): string {
  const url = `${SITE}${page.path}`
  const t = escAttr(page.title)
  const d = escAttr(page.description)
  const replacements: Array<[RegExp, string]> = [
    [/<title>[^<]*<\/title>/, `<title>${t}</title>`],
    [/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${d}" />`],
    [/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`],
    [/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`],
    [/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${t}" />`],
    [/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${d}" />`],
    [/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${t}" />`],
    [/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${d}" />`],
  ]
  let html = template
  for (const [re, value] of replacements) {
    if (!re.test(html)) throw new Error(`index.html no longer has the tag ${re}; update prerender/statePages.ts`)
    html = html.replace(re, () => value)
  }
  // JSON in a script tag: "<" escaped so no value can close the tag
  const data = page.data === undefined ? ''
    : `<script type="application/json" id="guide-data">${JSON.stringify(page.data).replace(/</g, '\\u003c')}</script>`
  if (!html.includes('<div id="root"></div>')) throw new Error('index.html no longer has <div id="root"></div>')
  return html.replace('<div id="root"></div>', () => `<div id="root">${page.body}</div>${data}`)
}

function addToSitemap(sitemap: string, paths: string[], lastmod: string): string {
  const entries = paths
    .filter(p => !sitemap.includes(`<loc>${SITE}${p}</loc>`))
    .map(p => `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`)
    .join('')
  return sitemap.replace('</urlset>', `${entries}</urlset>`)
}

export function statePagesPlugin(): Plugin {
  let outDir = ''
  let apiUrl = ''
  return {
    name: 'huntstack-state-pages',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      const env = loadEnv(config.mode, config.envDir ?? config.root, 'VITE_')
      apiUrl = (process.env.VITE_API_URL || env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '')
    },
    async closeBundle() {
      const log = (msg: string) => console.log(`[state-pages] ${msg}`)
      const indexPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(indexPath)) return // an SSR or library build: nothing to do
      const template = fs.readFileSync(indexPath, 'utf8')
      const now = new Date()
      const year = guideSeasonYear(now)
      const dir = path.join(outDir, GUIDE_BASE.slice(1))
      fs.mkdirSync(dir, { recursive: true })

      // The index lists the states and needs no data
      fs.writeFileSync(`${dir}.html`, fillTemplate(template, {
        path: GUIDE_BASE, title: `${INDEX_TITLE} | HuntStack`, description: INDEX_DESCRIPTION, body: renderIndexHtml(),
      }))

      let states: StateInfoInput[] = []
      let dashboard: DashboardInput | null = null
      try {
        states = (await getJson<{ states: StateInfoInput[] }>(`${apiUrl}/api/regulations/states`)).states
      } catch (err) {
        log(`no state list (${(err as Error).message}); agency names left out`)
      }
      try {
        dashboard = await getJson<DashboardInput>(`${apiUrl}/api/refuges/migration/dashboard`)
      } catch (err) {
        log(`no bird counts (${(err as Error).message}); pages written without them`)
      }

      let written = 0
      for (const state of GUIDE_STATES) {
        let seasons: SeasonInput[]
        try {
          seasons = (await getJson<{ seasons: SeasonInput[] }>(`${apiUrl}/api/regulations/${state.code}/seasons?year=${year}`)).seasons
        } catch (err) {
          log(`${state.name}: skipped, seasons unavailable (${(err as Error).message})`)
          continue
        }
        const guide = buildGuide(state, states.find(s => s.code === state.code) ?? null, seasons, dashboard, now)
        fs.writeFileSync(path.join(dir, `${state.slug}.html`), fillTemplate(template, {
          path: guidePath(state),
          title: `${guideTitle(guide)} | HuntStack`,
          description: guideSummary(guide),
          body: renderGuideHtml(guide),
          data: guide,
        }))
        written++
      }
      log(`wrote ${written} of ${GUIDE_STATES.length} state pages from ${apiUrl}`)

      const sitemapPath = path.join(outDir, 'sitemap.xml')
      if (fs.existsSync(sitemapPath)) {
        const lastmod = now.toISOString().slice(0, 10)
        const paths = [GUIDE_BASE, ...GUIDE_STATES.map(guidePath)]
        fs.writeFileSync(sitemapPath, addToSitemap(fs.readFileSync(sitemapPath, 'utf8'), paths, lastmod))
      }
    },
  }
}
