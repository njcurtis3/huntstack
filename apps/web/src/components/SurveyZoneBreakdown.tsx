import { MapPin } from 'lucide-react'
import type { SurveyZone } from '../lib/api'
import { oldSurveyLabel, parseCalendarDate } from '../lib/dates'

const PERIOD_NAMES: Record<string, string> = {
  Nov: 'Late-November', Dec: 'December', MWS: 'Midwinter (early January)', Jan: 'Late-January',
}

/** Percent against the zone's average for the same survey period in earlier years. */
function VsAverage({ value, average }: { value: number | null; average: number | null }) {
  if (value == null || !average) return null
  const pct = Math.round(((value - average) / average) * 100)
  const up = pct >= 0
  return (
    <span className={`text-xs font-medium ${up ? 'text-forest-600 dark:text-forest-400' : 'text-red-600 dark:text-red-400'}`}>
      {up ? '+' : ''}{pct}% vs avg
    </span>
  )
}

/**
 * Where a statewide survey found its ducks, zone by zone (AGFC's Arkansas survey zones).
 * These are parts of the statewide count shown above, never extra birds.
 */
export function SurveyZoneBreakdown({ zones, isStale }: { zones: SurveyZone[]; isStale: boolean }) {
  if (zones.length === 0) return null
  const first = zones[0]
  const kind = PERIOD_NAMES[first.period.split('-')[0]] ?? first.period
  const when = isStale
    ? oldSurveyLabel(first.surveyDate)
    : parseCalendarDate(first.surveyDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const sorted = [...zones].sort((a, b) => (b.totalDucks ?? b.mallards) - (a.totalDucks ?? a.mallards))
  const max = Math.max(...sorted.map(z => z.totalDucks ?? z.mallards), 1)

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="w-4 h-4" style={{ color: `rgb(var(--color-text-tertiary))` }} />
        <h4 className="text-sm font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>
          Where the ducks were, by survey zone
        </h4>
      </div>
      <p className="text-xs mb-3" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        {kind} survey · {when}{first.dateExact ? '' : ' (approximate date)'}. Part of the statewide count above;
        averages are the same survey period in earlier years since 2011.
      </p>
      <ul className="space-y-2">
        {sorted.map(z => {
          const ducks = z.totalDucks ?? z.mallards
          return (
            <li key={z.zone} className="text-sm">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="font-medium min-w-0" style={{ color: `rgb(var(--color-text-secondary))` }}>
                  {z.zone}
                  <span className="ml-1.5 text-xs font-normal" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                    {z.region === 'Delta' ? 'Delta' : 'River Valley'}
                  </span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold tabular-nums" style={{ color: `rgb(var(--color-text-primary))` }}>
                    {z.totalDucks != null ? `${z.totalDucks.toLocaleString()} ducks` : `${z.mallards.toLocaleString()} mallards`}
                  </span>
                  <VsAverage value={z.totalDucks ?? z.mallards} average={z.totalDucks != null ? z.avgTotalDucks : z.avgMallards} />
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: `rgb(var(--color-bg-tertiary))` }}>
                <div className="h-full rounded-full bg-forest-500" style={{ width: `${(ducks / max) * 100}%` }} />
              </div>
              {z.totalDucks != null && (
                <p className="text-xs mt-0.5" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                  {z.mallards.toLocaleString()} mallards
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
