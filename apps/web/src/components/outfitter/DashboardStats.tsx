import { useState } from 'react'
import {
  errorMessage,
  panelStyle,
  primaryText,
  secondaryText,
  useMyStats,
  type StatsDays,
} from '../../lib/outfitterAccount'

const RANGES: StatsDays[] = [7, 30, 90]

/** 'YYYY-MM-DD' -> 'Nov 7', without a timezone shift. */
function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function DashboardStats() {
  const [days, setDays] = useState<StatsDays>(30)
  const stats = useMyStats(days, true)

  const totals = stats.data
    ? [
        { label: 'Directory appearances', value: stats.data.totals.impression },
        { label: 'Listing views', value: stats.data.totals.detail },
        { label: 'Call/Website taps', value: stats.data.totals.contact },
      ]
    : []

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Time range" className="flex gap-2">
        {RANGES.map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
            className={`flex-1 md:flex-none min-h-11 px-5 rounded-md border text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              days === d ? 'bg-accent-500 text-white border-accent-500' : ''
            }`}
            style={days === d ? undefined : { ...panelStyle, color: 'rgb(var(--color-text-primary))' }}>
            {d} days
          </button>
        ))}
      </div>

      {stats.isLoading && <p className="text-base" style={secondaryText}>Loading...</p>}
      {stats.error && <p role="alert" className="text-base text-red-600">{errorMessage(stats.error)}</p>}

      {stats.data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {totals.map((t) => (
              <div key={t.label} className="rounded-lg border p-4" style={panelStyle}>
                <p className="text-base" style={secondaryText}>{t.label}</p>
                <p className="text-3xl font-bold" style={primaryText}>{t.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          <p className="text-sm" style={secondaryText}>
            Approximate. Counted once per visitor per day; known bots excluded.
          </p>

          <section aria-label="Daily breakdown" className="rounded-lg border" style={panelStyle}>
            <div className="grid grid-cols-[minmax(4.5rem,1.2fr)_1fr_1fr_1fr] gap-2 px-4 py-2 text-sm font-medium border-b"
              style={{ ...secondaryText, borderColor: 'rgb(var(--color-border-primary))' }}>
              <span>Day</span>
              <span className="text-right">Appeared</span>
              <span className="text-right">Viewed</span>
              <span className="text-right">Taps</span>
            </div>
            <ul>
              {[...stats.data.daily].reverse().map((row) => (
                <li key={row.day} className="grid grid-cols-[minmax(4.5rem,1.2fr)_1fr_1fr_1fr] gap-2 px-4 py-2 text-base" style={primaryText}>
                  <span>{shortDay(row.day)}</span>
                  <span className="text-right">{row.impression}</span>
                  <span className="text-right">{row.detail}</span>
                  <span className="text-right">{row.contact}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
