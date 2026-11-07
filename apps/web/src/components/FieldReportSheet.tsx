import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { FieldReportForm } from './FieldReportForm'

interface FieldReportSheetProps {
  onClose: () => void
}

/** Bottom sheet on a phone, centered dialog from md up. Sits below AuthModal (z-[100]). */
export function FieldReportSheet({ onClose }: FieldReportSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Kept in a ref so a new onClose identity from the parent never re-runs the focus effect.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      if (previous?.isConnected) {
        previous.focus()
      } else {
        // The mobile FAB is unmounted while the sheet is open; hand focus to whichever trigger is visible.
        requestAnimationFrame(() => {
          const triggers = Array.from(document.querySelectorAll<HTMLElement>('[data-report-trigger]'))
          const target = triggers.find((el) => el.offsetParent !== null)
          ;(target ?? document.body).focus()
        })
      }
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end md:items-center md:justify-center md:p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-report-title"
        tabIndex={-1}
        className="w-full max-h-[92dvh] md:max-w-3xl flex flex-col rounded-t-xl md:rounded-xl shadow-xl outline-none"
        style={{ backgroundColor: 'rgb(var(--color-bg-elevated))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="shrink-0 flex items-start justify-between gap-3 px-4 py-3 md:px-6 border-b"
          style={{ borderColor: 'rgb(var(--color-border-primary))' }}
        >
          <div className="min-w-0">
            <h2 id="field-report-title" className="text-lg font-semibold" style={{ color: 'rgb(var(--color-text-primary))' }}>
              Report birds
            </h2>
            <p className="text-sm" style={{ color: 'rgb(var(--color-text-secondary))' }}>
              Hunter reports, unverified
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md hover:bg-earth-100 dark:hover:bg-earth-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" style={{ color: 'rgb(var(--color-text-secondary))' }} />
          </button>
        </div>
        <FieldReportForm onClose={onClose} />
      </div>
    </div>
  )
}
