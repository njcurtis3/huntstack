import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Bird, Sparkles, Loader2, Wind, TrendingUp, TrendingDown, Minus, Zap, ExternalLink,
} from 'lucide-react'
import { api } from '../lib/api'

// ─── Types (mirrored from MigrationPage) ──────────────────────────────────────

type CurrentCount = {
  refugeId: string
  refugeName: string
  state: string
  species: string
  speciesName: string
  count: number
  surveyDate: string
  flyway: string | null
  previousCount: number | null
  deltaPercent: number | null
  trend: 'increasing' | 'decreasing' | 'stable' | 'new'
}

type PushFactor = {
  stateCode: string
  pushScore: number
  coldFrontPresent: boolean
  coldFrontIncoming: boolean
  windDirection: string | null
  windIsFromNorth: boolean
  temperature: number | null
  temperatureUnit: string | null
}

type MigrationStatus =
  | 'arriving' | 'building' | 'peak' | 'declining' | 'departing' | 'first_survey' | null

type AnomalyType = 'spike' | 'drop' | null

// ─── Pure helpers (copied from MigrationPage) ─────────────────────────────────

const STATE_CODE_TO_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

const FLYWAY_OPTIONS: Record<string, string> = {
  central: 'Central Flyway',
  mississippi: 'Mississippi Flyway',
  pacific: 'Pacific Flyway',
  atlantic: 'Atlantic Flyway',
}

const STATUS_CONFIG: Record<NonNullable<MigrationStatus>, { label: string; color: string }> = {
  arriving:     { label: 'Arriving',    color: '#1f883d' },
  building:     { label: 'Building',    color: '#0969da' },
  peak:         { label: 'Peak',        color: '#bf8700' },
  declining:    { label: 'Declining',   color: '#bc4c00' },
  departing:    { label: 'Departing',   color: '#cf222e' },
  first_survey: { label: 'New Data',    color: '#8250df' },
}

const PUSH_SCORE_LABELS = ['Low', 'Moderate', 'High', 'Extreme']

function getMigrationStatus(
  trend: 'increasing' | 'decreasing' | 'stable' | 'new',
  deltaPercent: number | null,
): MigrationStatus {
  if (trend === 'new') return 'first_survey'
  if (trend === 'increasing') return (deltaPercent !== null && deltaPercent > 20) ? 'arriving' : 'building'
  if (trend === 'stable') return 'peak'
  if (trend === 'decreasing') return (deltaPercent !== null && deltaPercent < -20) ? 'departing' : 'declining'
  return null
}

function getAnomaly(count: number, deltaPercent: number | null, previousCount: number | null): AnomalyType {
  if (deltaPercent === null || previousCount === null) return null
  if (deltaPercent >= 30 && count >= 500) return 'spike'
  if (deltaPercent <= -40 && previousCount >= 500) return 'drop'
  return null
}

function computeMigrationIndex(
  counts: Array<{ trend: string; anomaly: AnomalyType; deltaPercent: number | null }>,
  overallPushScore: number,
): { score: number; label: string } {
  if (counts.length === 0) return { score: 0, label: 'Quiet' }
  const withData = counts.filter(c => c.trend !== 'new')
  const increasing = withData.filter(c => c.trend === 'increasing').length
  const trendScore = withData.length > 0 ? Math.round((increasing / withData.length) * 25) : 0
  const posDeltas = withData.filter(c => c.deltaPercent !== null && c.deltaPercent > 0)
  const avgDelta = posDeltas.length > 0 ? posDeltas.reduce((s, c) => s + (c.deltaPercent ?? 0), 0) / posDeltas.length : 0
  const volumeScore = Math.min(25, Math.round((avgDelta / 60) * 25))
  const weatherScore = Math.round((overallPushScore / 3) * 25)
  const spikes = counts.filter(c => c.anomaly === 'spike').length
  const drops = counts.filter(c => c.anomaly === 'drop').length
  const anomalyScore = Math.max(0, Math.min(25, 12 + spikes * 6 - drops * 4))
  const total = Math.min(100, trendScore + volumeScore + weatherScore + anomalyScore)
  let label = 'Quiet'
  if (total >= 76) label = 'Peak Movement'
  else if (total >= 51) label = 'Strong'
  else if (total >= 26) label = 'Active'
  return { score: total, label }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'increasing') return <TrendingUp className="w-3.5 h-3.5" style={{ color: '#1f883d' }} />
  if (trend === 'decreasing') return <TrendingDown className="w-3.5 h-3.5" style={{ color: '#cf222e' }} />
  return <Minus className="w-3.5 h-3.5" style={{ color: '#6e7781' }} />
}

type StateGroup = {
  state: string
  stateName: string
  totalBirds: number
  refugeCount: number
  speciesCount: number
  latestDate: string
  topAnomaly: AnomalyType
  dominantStatus: MigrationStatus
  topItems: Array<{ refugeName: string; count: number; trend: string }>
}

function StateReportCard({ sg }: { sg: StateGroup }) {
  const status = sg.dominantStatus ? STATUS_CONFIG[sg.dominantStatus] : null

  return (
    <div style={{
      border: '1px solid #d0d7de',
      borderRadius: 8,
      padding: '16px 20px',
      background: '#fff',
      pageBreakInside: 'avoid',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#1f2328' }}>{sg.stateName}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#f6f8fa', color: '#57606a', border: '1px solid #d0d7de' }}>
            {sg.state}
          </span>
          {status && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: `${status.color}18`, color: status.color, fontWeight: 600 }}>
              {status.label}
            </span>
          )}
          {sg.topAnomaly === 'spike' && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fff8c5', color: '#9a6700', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
              <Zap style={{ width: 10, height: 10 }} /> Spike
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: '#57606a' }}>
          {new Date(sg.latestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2328' }}>{sg.totalBirds.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#57606a' }}>birds counted</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2328' }}>{sg.refugeCount}</div>
          <div style={{ fontSize: 11, color: '#57606a' }}>refuges reporting</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2328' }}>{sg.speciesCount}</div>
          <div style={{ fontSize: 11, color: '#57606a' }}>species</div>
        </div>
      </div>

      {sg.topItems.length > 0 && (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
          {sg.topItems.slice(0, 3).map(item => (
            <div key={item.refugeName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#57606a', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendIcon trend={item.trend} />
                <span>{item.refugeName}</span>
              </div>
              <span style={{ fontWeight: 600, color: '#1f2328' }}>{item.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function MigrationReportPage() {
  const [searchParams] = useSearchParams()
  const flyway = searchParams.get('flyway') ?? undefined
  const species = searchParams.get('species') ?? undefined

  const [counts, setCounts] = useState<CurrentCount[]>([])
  const [pushData, setPushData] = useState<{ pushFactors: PushFactor[]; overallPushScore: number } | null>(null)
  const [summary, setSummary] = useState<{ summary: string; generatedAt: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // Update page title
  useEffect(() => {
    const parts = ['Migration Conditions Report']
    if (flyway && FLYWAY_OPTIONS[flyway]) parts.push(FLYWAY_OPTIONS[flyway])
    document.title = `${parts.join(' · ')} — HuntStack`
    return () => { document.title = 'HuntStack' }
  }, [flyway])

  // Fetch all data in parallel
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [dashboardData, summaryData] = await Promise.all([
          api.getMigrationDashboard({ flyway, species }),
          api.getMigrationWeeklySummary({ flyway, species }),
        ])
        if (cancelled) return
        setCounts(dashboardData.currentCounts)
        setSummary(summaryData)

        // Fetch push factors for states in the data
        const states = [...new Set(dashboardData.currentCounts.map((c: CurrentCount) => c.state))]
        if (states.length > 0) {
          try {
            const pd = await api.getMigrationPushFactors(states.join(','))
            if (!cancelled) setPushData(pd)
          } catch { /* optional */ }
        }
      } catch { /* silently handle */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [flyway, species])

  // Build state groups
  const stateGroups = useMemo((): StateGroup[] => {
    const enriched = counts.map(c => ({
      ...c,
      anomaly: getAnomaly(c.count, c.deltaPercent, c.previousCount),
      migrationStatus: getMigrationStatus(c.trend, c.deltaPercent),
    }))

    const byState = new Map<string, typeof enriched>()
    for (const c of enriched) {
      const arr = byState.get(c.state) ?? []
      arr.push(c)
      byState.set(c.state, arr)
    }

    return Array.from(byState.entries()).map(([state, items]) => {
      const totalBirds = items.reduce((s, c) => s + c.count, 0)
      const refuges = new Set(items.map(c => c.refugeId))
      const species = new Set(items.map(c => c.species))
      const latestDate = items.reduce((best, c) => c.surveyDate > best ? c.surveyDate : best, items[0].surveyDate)
      const topAnomaly: AnomalyType = items.some(c => c.anomaly === 'spike') ? 'spike'
        : items.some(c => c.anomaly === 'drop') ? 'drop' : null
      const statusPriority: MigrationStatus[] = ['arriving', 'first_survey', 'building', 'peak', 'declining', 'departing', null]
      const dominantStatus = statusPriority.find(s => items.some(c => c.migrationStatus === s)) ?? null

      // Top refuges sorted by count
      const byRefuge = new Map<string, { refugeName: string; count: number; trend: string }>()
      for (const c of items) {
        const ex = byRefuge.get(c.refugeId)
        if (!ex) byRefuge.set(c.refugeId, { refugeName: c.refugeName, count: c.count, trend: c.trend })
        else ex.count += c.count
      }
      const topItems = Array.from(byRefuge.values()).sort((a, b) => b.count - a.count)

      return {
        state,
        stateName: STATE_CODE_TO_NAME[state] ?? state,
        totalBirds,
        refugeCount: refuges.size,
        speciesCount: species.size,
        latestDate,
        topAnomaly,
        dominantStatus,
        topItems,
      }
    }).sort((a, b) => b.totalBirds - a.totalBirds)
  }, [counts])

  const migrationIndex = useMemo(() => {
    const enriched = counts.map(c => ({
      trend: c.trend,
      anomaly: getAnomaly(c.count, c.deltaPercent, c.previousCount),
      deltaPercent: c.deltaPercent,
    }))
    return computeMigrationIndex(enriched, pushData?.overallPushScore ?? 0)
  }, [counts, pushData])

  const totalBirds = counts.reduce((s, c) => s + c.count, 0)
  const refugeCount = new Set(counts.map(c => c.refugeId)).size
  const overallPushScore = pushData?.overallPushScore ?? 0
  const pushLabel = PUSH_SCORE_LABELS[Math.min(overallPushScore, 3)]

  const anyColdFront = pushData?.pushFactors.some(f => f.coldFrontPresent) ?? false
  const anyNorthWind = pushData?.pushFactors.some(f => f.windIsFromNorth) ?? false
  const anySubFreezing = pushData?.pushFactors.some(f => f.temperature !== null && f.temperature < 32) ?? false
  const anyColdFrontIncoming = pushData?.pushFactors.some(f => f.coldFrontIncoming) ?? false

  const generatedDate = summary?.generatedAt
    ? new Date(summary.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const flywayLabel = flyway ? (FLYWAY_OPTIONS[flyway] ?? flyway) : 'All Flyways'

  return (
    <div style={{ background: '#fff', minHeight: '100vh', colorScheme: 'light' }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #d0d7de', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/duck-image-1.png" alt="HuntStack" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1f2328' }}>huntstack</span>
          <span style={{ color: '#d0d7de', fontSize: 14, margin: '0 4px' }}>·</span>
          <span style={{ fontSize: 13, color: '#57606a' }}>Migration Conditions Report</span>
        </div>
        <Link
          to="/migration"
          style={{ fontSize: 13, color: '#0969da', display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
        >
          View live dashboard <ExternalLink style={{ width: 12, height: 12 }} />
        </Link>
      </div>

      {/* Print header — only visible when printing */}
      <div style={{ display: 'none', padding: '20px 32px 0' }} className="print-only">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Bird style={{ width: 20, height: 20, color: '#1f883d' }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: '#1f2328' }}>huntstack.com — Migration Conditions Report</span>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Report title block */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Bird style={{ width: 22, height: 22, color: '#1f883d' }} />
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1f2328', margin: 0 }}>
              Migration Conditions Report
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 20, background: '#f6f8fa', border: '1px solid #d0d7de', color: '#57606a' }}>
              {flywayLabel}
            </span>
            <span style={{ fontSize: 12, color: '#57606a' }}>Generated {generatedDate}</span>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#57606a', padding: 40, justifyContent: 'center' }}>
            <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
            <span>Loading report data…</span>
          </div>
        ) : (
          <>
            {/* Intelligence Summary */}
            {summary && (
              <div style={{ border: '1px solid #d0d7de', borderRadius: 8, padding: '20px 24px', marginBottom: 24, background: '#f6f8fa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Sparkles style={{ width: 16, height: 16, color: '#0969da' }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1f2328' }}>Weekly Intelligence</span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: '#1f2328', margin: 0 }}>
                  {summary.summary
                    .replace(/\*\*([^*]+)\*\*/g, '$1')
                    .replace(/\*([^*]+)\*/g, '$1')
                    .replace(/^#+\s+/gm, '')
                    .replace(/^[-*]\s+/gm, '')
                    .trim()
                  }
                </p>
              </div>
            )}

            {/* Summary Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Birds', value: totalBirds.toLocaleString() },
                { label: 'Refuges Reporting', value: refugeCount.toString() },
                { label: 'Migration Index', value: `${migrationIndex.score}/100`, sub: migrationIndex.label },
              ].map(stat => (
                <div key={stat.label} style={{ border: '1px solid #d0d7de', borderRadius: 8, padding: '16px 20px', background: '#fff', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#1f2328' }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: '#57606a', marginTop: 2 }}>{stat.label}</div>
                  {stat.sub && <div style={{ fontSize: 11, color: '#0969da', fontWeight: 600, marginTop: 4 }}>{stat.sub}</div>}
                </div>
              ))}
            </div>

            {/* Migration Pressure */}
            {pushData && (
              <div style={{ border: '1px solid #d0d7de', borderRadius: 8, padding: '16px 20px', marginBottom: 24, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Wind style={{ width: 16, height: 16, color: '#0969da' }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1f2328' }}>Migration Pressure</span>
                  <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: overallPushScore >= 2 ? '#fff8c5' : '#f6f8fa', color: overallPushScore >= 2 ? '#9a6700' : '#57606a', border: `1px solid ${overallPushScore >= 2 ? '#e3b341' : '#d0d7de'}`, fontWeight: 600 }}>
                    {pushLabel}
                  </span>
                  {/* Push dots */}
                  <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                    {[1, 2, 3].map(i => (
                      <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', background: overallPushScore >= i ? (i === 3 ? '#cf222e' : i === 2 ? '#bc4c00' : '#bf8700') : '#d0d7de' }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {[
                    { active: anyColdFront, label: 'Cold front present', icon: '🌬️' },
                    { active: anyColdFrontIncoming, label: 'Cold front incoming (48h)', icon: '📉' },
                    { active: anyNorthWind, label: 'North winds', icon: '🧭' },
                    { active: anySubFreezing, label: 'Sub-freezing temps', icon: '🧊' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 12px', borderRadius: 6, background: item.active ? '#dafbe1' : '#f6f8fa', color: item.active ? '#1a7f37' : '#57606a' }}>
                      <span>{item.icon}</span>
                      <span style={{ fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* State Cards */}
            {stateGroups.length > 0 && (
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1f2328', marginBottom: 14 }}>
                  Current Activity by State
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
                  {stateGroups.map(sg => (
                    <StateReportCard key={sg.state} sg={sg} />
                  ))}
                </div>
              </div>
            )}

            {stateGroups.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: '#57606a' }}>
                No survey data available for the selected filters.
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #d0d7de', fontSize: 12, color: '#57606a' }}>
          <p style={{ margin: '0 0 4px' }}>
            Generated {generatedDate} · Data from USFWS, state wildlife agencies, and NWS · <strong>huntstack.com</strong>
          </p>
          <p style={{ margin: 0 }}>
            Always verify regulations with official sources before hunting.
          </p>
        </div>
      </div>
    </div>
  )
}
