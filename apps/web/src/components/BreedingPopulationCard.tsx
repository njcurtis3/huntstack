import {
  BREEDING_PONDS,
  BREEDING_SOURCE_URL,
  BREEDING_SPECIES,
  BREEDING_TOTAL,
  BREEDING_YEAR,
  formatThousands,
  significantChange,
  type BreedingRow,
} from '../lib/breedingPopulation'

// The agencies and flyway councils that run the survey (public/images/partners/)
const PARTNERS = [
  { file: 'central-flyway-council', name: 'Central Flyway Council', w: 208, h: 104 },
  { file: 'usfws', name: 'U.S. Fish and Wildlife Service', w: 87, h: 104 },
  { file: 'pacific-flyway-council', name: 'Pacific Flyway Council', w: 104, h: 95 },
  { file: 'canadian-wildlife-service', name: 'Canadian Wildlife Service', w: 112, h: 112 },
  { file: 'atlantic-flyway-council', name: 'Atlantic Flyway Council', w: 112, h: 112 },
  { file: 'mississippi-flyway-council', name: 'Mississippi Flyway Council', w: 243, h: 104 },
]

const muted = { color: `rgb(var(--color-text-tertiary))` }
const primary = { color: `rgb(var(--color-text-primary))` }

function Change({ pct, p }: { pct: number; p: number }) {
  const c = significantChange(pct, p)
  if (c === null) return <span style={muted}>similar</span>
  return (
    <span className={`font-medium ${c > 0 ? 'text-forest-600 dark:text-forest-400' : 'text-red-600 dark:text-red-400'}`}>
      {c > 0 ? '+' : ''}{c.toLocaleString()}%
    </span>
  )
}

function Headline({ row, unit }: { row: BreedingRow; unit: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm" style={muted}>{row.name}</p>
      <p className="text-2xl font-bold" style={primary}>
        {formatThousands(row.now)} <span className="text-sm font-normal" style={muted}>{unit}</span>
      </p>
      <p className="text-xs mt-1" style={muted}>
        vs {BREEDING_YEAR - 1}: <Change pct={row.pct} p={row.p} /> · vs average: <Change pct={row.ltaPct} p={row.ltaP} />
      </p>
    </div>
  )
}

/**
 * This year's breeding population from the May survey, for the season's context. Not birds in
 * any hunting state, so it never feeds the Snapshot's counts.
 */
export default function BreedingPopulationCard({ selectedSpecies }: { selectedSpecies: string }) {
  const picked = BREEDING_SPECIES.find(s => s.slug === selectedSpecies)
  // A species the survey doesn't report (geese, wood duck, ring-necked duck...) gets the whole table
  const rows = picked ? [picked, ...BREEDING_SPECIES.filter(s => s !== picked)] : BREEDING_SPECIES

  return (
    <section
      aria-labelledby="breeding-title"
      className="rounded-lg border my-6"
      style={{ borderColor: `rgb(var(--color-border-primary))` }}
    >
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: `rgb(var(--color-border-primary))`, backgroundColor: `rgb(var(--color-bg-secondary))` }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 id="breeding-title" className="text-base font-bold" style={primary}>
              {BREEDING_YEAR} breeding population
            </h2>
            <p className="text-xs mt-0.5" style={muted}>
              The May survey of the northern breeding grounds (Canada, Alaska and the north-central U.S.). It sets
              up the fall flight; it is not a count of birds in your state.
            </p>
          </div>
          {/* The survey's partners. Transparent PNGs cut from one strip; the two with no outline of
              their own (CWS, Atlantic) sit on a white disc so they read in dark mode */}
          <ul className="flex-shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Survey partners">
            {PARTNERS.map(p => (
              <li key={p.file}>
                <img
                  src={`/images/partners/${p.file}.png`}
                  alt={p.name}
                  title={p.name}
                  width={p.w}
                  height={p.h}
                  className="h-8 sm:h-9 w-auto"
                  loading="lazy"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Headline row={BREEDING_TOTAL} unit="ducks" />
          <Headline row={BREEDING_PONDS} unit="ponds" />
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid rgb(var(--color-border-primary))` }}>
                <th scope="col" className="text-left font-medium py-2 pr-3" style={muted}>Species</th>
                <th scope="col" className="text-right font-medium py-2 pr-3" style={muted}>{BREEDING_YEAR}</th>
                <th scope="col" className="text-right font-medium py-2 pr-3" style={muted}>vs {BREEDING_YEAR - 1}</th>
                <th scope="col" className="text-right font-medium py-2" style={muted}>vs average</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isPicked = row === picked
                return (
                  <tr
                    key={row.slug}
                    className="last:border-0"
                    style={{
                      borderBottom: `1px solid rgb(var(--color-border-primary))`,
                      backgroundColor: isPicked ? `rgb(var(--color-bg-secondary))` : undefined,
                    }}
                  >
                    <th scope="row" className={`text-left py-2 pr-3 ${isPicked ? 'font-bold' : 'font-medium'}`} style={primary}>
                      {row.name}
                    </th>
                    <td className="text-right py-2 pr-3 tabular-nums" style={primary}>{formatThousands(row.now)}</td>
                    <td className="text-right py-2 pr-3 tabular-nums"><Change pct={row.pct} p={row.p} /></td>
                    <td className="text-right py-2 tabular-nums"><Change pct={row.ltaPct} p={row.ltaP} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs mt-3" style={muted}>
          &ldquo;Similar&rdquo; means the survey can&rsquo;t tell the change from chance. Average is 1955–{BREEDING_YEAR - 1}.
          Source:{' '}
          <a href={BREEDING_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline">
            USFWS, Waterfowl Population Status, {BREEDING_YEAR}
          </a>
          .
        </p>
      </div>
    </section>
  )
}
