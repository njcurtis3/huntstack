import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

// A notice the reader can close for good. The dismissal is remembered per notice in this browser;
// storage can be blocked (private mode), in which case the notice simply returns on the next visit.
function isDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function rememberDismissed(key: string) {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // Storage unavailable — hiding it for this page view is still what the reader asked for
  }
}

export function DismissibleNotice({
  id,
  className,
  innerClassName,
  children,
}: {
  /** Unique per notice; bump it (e.g. "-v2") when the text changes enough that readers should see it again. */
  id: string
  className: string
  /** Optional inner wrapper, for full-width bars that center their content. */
  innerClassName?: string
  children: ReactNode
}) {
  const key = `notice-dismissed:${id}`
  const [hidden, setHidden] = useState(() => isDismissed(key))
  if (hidden) return null

  const content = (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={() => {
          rememberDismissed(key)
          setHidden(true)
        }}
        aria-label="Dismiss notice"
        className="flex-shrink-0 -my-1 -mr-1 p-1 rounded opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <div className={className}>
      {innerClassName ? <div className={innerClassName}>{content}</div> : content}
    </div>
  )
}
