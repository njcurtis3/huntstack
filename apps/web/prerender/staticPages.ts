/**
 * Vite build plugin: writes pages with no data of their own as real HTML, rendered from the same
 * React component the site shows, so search engines read them without running JavaScript.
 *
 * Today that is /how-it-works. Each page is dist/index.html with its own title, description,
 * canonical and Open Graph tags (fillTemplate, shared with the state guides) and the component's
 * markup inside #root; React replaces #root on load as on any other page. Files are
 * dist/<path>.html, not <path>/index.html, for the reason in statePages.ts (CONSTRAINTS §6.7a).
 * The page must already be in public/sitemap.xml.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import type { Plugin } from 'vite'
import { HowItWorksPage } from '../src/pages/HowItWorksPage'
import { fillTemplate } from './statePages'

const PAGES: Array<{ path: string; title: string; description: string; component: ComponentType }> = [
  {
    path: '/how-it-works',
    title: 'How HuntStack Works: counts, rankings and labels explained | HuntStack',
    description:
      'Where HuntStack’s duck and goose numbers come from, why some states look low, how Where to Hunt ranks areas, and what Arriving, Peak, Spike and the weather push score mean.',
    component: HowItWorksPage,
  },
]

export function staticPagesPlugin(): Plugin {
  let outDir = ''
  return {
    name: 'huntstack-static-pages',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const indexPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(indexPath)) return
      const template = fs.readFileSync(indexPath, 'utf8')
      for (const page of PAGES) {
        const body = renderToStaticMarkup(
          createElement(StaticRouter, { location: page.path }, createElement(page.component)),
        )
        fs.writeFileSync(path.join(outDir, `${page.path.slice(1)}.html`), fillTemplate(template, { ...page, body }))
      }
      console.log(`[static-pages] wrote ${PAGES.map(p => p.path).join(', ')}`)
    },
  }
}
