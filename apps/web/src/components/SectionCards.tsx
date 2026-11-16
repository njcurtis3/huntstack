import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { ChevronsDown, ChevronsUp } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'

export type SectionCard = {
  id: string
  title: string
  /** One line under the title: a headline number or what the section holds */
  teaser: ReactNode
  icon: ComponentType<{ className?: string }>
}

/**
 * Which sections are open, remembered per viewer in localStorage. Storage can be missing or
 * throw (private windows, previews); the page then simply starts with nothing open.
 */
export function useOpenSections(storageKey: string, ids: string[]) {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      return new Set(Array.isArray(saved) ? saved.filter((id: unknown) => typeof id === 'string' && ids.includes(id)) : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify([...open])) } catch { /* not saved */ }
  }, [open, storageKey])

  const isOpen = useCallback((id: string) => open.has(id), [open])
  const toggle = useCallback((id: string) => {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  /** Open one section (if it isn't already) and bring it into view */
  const reveal = useCallback((id: string) => {
    setOpen(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])
  const openAll = useCallback(() => setOpen(new Set(ids)), [ids])
  const closeAll = useCallback(() => setOpen(new Set()), [])
  return { open, isOpen, toggle, reveal, openAll, closeAll }
}

export function sectionDomId(id: string) {
  return `section-${id}`
}

/**
 * Square cards, one per section of the page. Selecting a card opens its section below the grid;
 * selecting it again closes it. Open sections keep the grid's order.
 */
export function SectionCardGrid({ cards, isOpen, onToggle, onOpenAll, onCloseAll }: {
  cards: SectionCard[]
  isOpen: (id: string) => boolean
  onToggle: (id: string) => void
  onOpenAll: () => void
  onCloseAll: () => void
}) {
  const openCount = cards.filter(c => isOpen(c.id)).length
  // Thumbnails are screenshots of each section (public/images/migration-cards/<id>-<theme>.webp)
  const theme = useThemeStore(st => st.resolvedTheme) === 'dark' ? 'dark' : 'light'
  const handle = (id: string) => {
    const opening = !isOpen(id)
    onToggle(id)
    // Bring a newly opened section into view once it has rendered
    if (opening) {
      setTimeout(() => {
        document.getElementById(sectionDomId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
        <p className="text-sm" style={{ color: `rgb(var(--color-text-tertiary))` }}>
          {openCount === 0 ? 'Pick a card to open its section.' : `${openCount} of ${cards.length} open`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAll}
            disabled={openCount === cards.length}
            className="btn-secondary text-sm gap-1.5 min-h-[44px] whitespace-nowrap disabled:opacity-50"
          >
            <ChevronsDown className="w-4 h-4" /> Open all
          </button>
          <button
            type="button"
            onClick={onCloseAll}
            disabled={openCount === 0}
            className="btn-secondary text-sm gap-1.5 min-h-[44px] whitespace-nowrap disabled:opacity-50"
          >
            <ChevronsUp className="w-4 h-4" /> Close all
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map(card => {
          const active = isOpen(card.id)
          const Icon = card.icon
          return (
            <button
              key={card.id}
              type="button"
              aria-pressed={active}
              aria-controls={sectionDomId(card.id)}
              onClick={() => handle(card.id)}
              className={`group aspect-square rounded-lg border p-2 sm:p-3 flex flex-col gap-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                active
                  ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                  : 'hover:border-accent-400'
              }`}
              style={active ? undefined : { borderColor: `rgb(var(--color-border-primary))`, backgroundColor: `rgb(var(--color-bg-secondary))` }}
            >
              {/* A picture of the section: blurred until hovered, focused or opened (touch screens
                  can't hover, so an open card shows it sharp) */}
              <div
                className="relative flex-1 min-h-0 rounded-md overflow-hidden border"
                style={{ borderColor: `rgb(var(--color-border-primary))`, backgroundColor: `rgb(var(--color-bg-primary))` }}
              >
                <img
                  src={`/images/migration-cards/${card.id}-${theme}.webp`}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className={`absolute inset-0 w-full h-full object-cover object-left-top transition-[filter,transform] duration-300 motion-reduce:transition-none ${
                    active
                      ? 'blur-0'
                      : 'blur-[3px] scale-105 group-hover:blur-0 group-hover:scale-100 group-focus-visible:blur-0 group-focus-visible:scale-100'
                  }`}
                />
                <span
                  className={`absolute top-1.5 left-1.5 inline-flex items-center justify-center w-8 h-8 rounded-md shadow-sm ${
                    active ? 'bg-accent-500 text-white' : 'text-accent-600 dark:text-accent-400'
                  }`}
                  style={active ? undefined : { backgroundColor: `rgb(var(--color-bg-secondary))` }}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span
                  className={`absolute top-1.5 right-1.5 text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 shadow-sm ${
                    active ? 'bg-accent-500 text-white' : ''
                  }`}
                  style={active ? undefined : { backgroundColor: `rgb(var(--color-bg-secondary))`, color: `rgb(var(--color-text-tertiary))` }}
                >
                  {active ? 'Open' : 'Closed'}
                </span>
              </div>
              <div className="min-w-0 px-1 pb-0.5">
                <p className="font-semibold leading-tight text-sm sm:text-base truncate" style={{ color: `rgb(var(--color-text-primary))` }}>{card.title}</p>
                <p className="text-xs mt-0.5 line-clamp-2" style={{ color: `rgb(var(--color-text-tertiary))` }}>{card.teaser}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
