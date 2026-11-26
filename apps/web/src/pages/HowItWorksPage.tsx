import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// How HuntStack Works: the plain-language guide to why each page says what it says.
// Every number below is the code's own rule (lib/migrationStats.ts, lib/migrationGroups.ts,
// apps/api lib/hunt-areas.ts, routes/hunt-areas.ts, lib/weather.ts). Change a rule there,
// change it here.

const primary = { color: `rgb(var(--color-text-primary))` }
const secondary = { color: `rgb(var(--color-text-secondary))` }
const muted = { color: `rgb(var(--color-text-tertiary))` }
const border = { borderColor: `rgb(var(--color-border-primary))` }

const SECTIONS = [
  { id: 'short', title: 'The short version' },
  { id: 'sources', title: 'Where the numbers come from' },
  { id: 'coverage', title: 'Why some states look low' },
  { id: 'where-to-hunt', title: 'Where to Hunt' },
  { id: 'migration', title: 'Migration page' },
  { id: 'weather', title: 'Weather push' },
  { id: 'regulations', title: 'Regulations' },
  { id: 'ask-ai', title: 'Ask AI' },
  { id: 'limits', title: 'What HuntStack can’t tell you' },
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 pt-10 border-t" style={border}>
      <h2 className="text-xl font-semibold tracking-tight mb-4" style={primary}>{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed" style={secondary}>{children}</div>
    </section>
  )
}

/** A term and what it means, as a two-column list on wide screens */
function Terms({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y rounded-md border" style={border}>
      {items.map(([term, meaning]) => (
        <div key={term} className="grid sm:grid-cols-[11rem_1fr] gap-x-4 gap-y-1 px-4 py-3" style={border}>
          <dt className="font-medium" style={primary}>{term}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold" style={primary}>{children}</strong>
}

export function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <p className="eyebrow font-sans font-semibold tracking-wider mb-2">Guide</p>
      <h1 className="text-3xl font-bold tracking-tight mb-3" style={primary}>How HuntStack Works</h1>
      <p className="text-[15px] leading-relaxed max-w-2xl" style={secondary}>
        Why HuntStack recommends what it does, what each label means, and how much weight to put on
        it. No math degree needed. HuntStack is for planning: it tells you where birds are being counted
        and what’s changing, and you still make the call.
      </p>

      {/* Contents */}
      <nav aria-label="On this page" className="mt-8 rounded-md border p-4" style={border}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={muted}>On this page</p>
        <ol className="grid sm:grid-cols-2 gap-x-6 text-sm">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-block py-1.5 text-accent-600 dark:text-accent-400 hover:underline">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        <Section id="short" title="The short version">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <Strong>Counts come from people who count birds:</Strong> refuge staff, state biologists flying
              aerial surveys, and birders on eBird. HuntStack doesn’t make up numbers or estimate birds it
              can’t see.
            </li>
            <li>
              <Strong>Which way the counts are moving matters as much as the total.</Strong> A refuge that
              tripled since last week is telling you birds are arriving; one that halved, that they’re
              leaving.
            </li>
            <li>
              <Strong>States aren’t counted the same way,</Strong> so a big total in one state and a small
              one in another doesn’t mean one has more birds. HuntStack compares each place with itself,
              and puts every state’s best area in front of you.
            </li>
            <li>
              <Strong>Weather moves birds.</Strong> Cold fronts, north wind and freezing temperatures push
              an area up the list.
            </li>
            <li>
              <Strong>Always check the agency.</Strong> Seasons, limits and access come from state and
              federal agencies, but the agency’s own page is the final word.
            </li>
          </ul>
        </Section>

        <Section id="sources" title="Where the numbers come from">
          <Terms items={[
            ['Agency surveys', <>
              Refuge staff counts and aerial surveys flown by state biologists and the Illinois Natural
              History Survey. These are the strongest evidence HuntStack has. Most are weekly; some states
              fly a few times a season.
            </>],
            ['eBird reports', <>
              Birders’ checklists at public hotspots over the last 14 days. They show where birds are being
              seen, but a birder counts what they can see from a parking lot, not a whole marsh, so eBird
              numbers run far below a survey of the same place.
            </>],
            ['Hunter reports', <>
              Birds reported by HuntStack hunters in the last 7 days. They’re unverified and shown only as
              a rounded area (never the exact spot). Each counts 5 to 300 birds, from the range the hunter
              picked.
            </>],
            ['Weather', <>NOAA National Weather Service forecasts for each region.</>],
            ['Seasons and licenses', <>Each state wildlife agency’s published dates, limits and fees.</>],
          ]} />
          <p>
            The full list, with links to every source, is on the{' '}
            <Link to="/data-sources" className="text-accent-600 dark:text-accent-400 hover:underline">Data Sources</Link> page.
          </p>
        </Section>

        <Section id="coverage" title="Why some states look low">
          <p>
            Most states don’t publish a statewide duck count during the season. What HuntStack can show
            depends on what each state’s agencies count:
          </p>
          <Terms items={[
            ['Arkansas, Louisiana', <>
              Statewide aerial survey estimates during the season (Arkansas a few flights from December
              to January, Louisiana monthly). These totals cover the whole state. Louisiana’s card also
              compares the newest survey with the same month in earlier years, back to 2004.
            </>],
            ['Mississippi', <>
              MDWFP’s aerial survey of the Mississippi Delta, flown in November, December and January.
              It covers the Delta, where most of the state’s ducks winter, not the whole state. The card
              compares the newest survey with the same month in earlier years, back to 2007.
            </>],
            ['Illinois, Missouri, Iowa', <>
              Weekly aerial counts along the Illinois and Mississippi rivers, plus refuge counts. Very
              detailed on the rivers, but not the whole state.
            </>],
            ['Texas, Oklahoma, Kansas, New Mexico', <>
              A few refuge counts plus eBird reports. The only statewide count is the January midwinter
              survey, and it’s published months later.
            </>],
          ]} />
          <p>
            So Texas can show a thousand birds while Louisiana shows hundreds of thousands. That’s about
            how each state is counted, not which state has more ducks. The Migration page labels each state’s
            card: <em>Waiting for midwinter survey counts</em>, <em>Site counts only</em>, or no label when
            the state’s statewide survey is current.
          </p>
          <p>
            That’s why HuntStack never ranks states by total birds. It looks at how much each place’s
            counts have changed, and it lists each state’s best area before any state’s second best.
          </p>
        </Section>

        <Section id="where-to-hunt" title="Where to Hunt">
          <p>
            Where to Hunt groups survey sites, eBird hotspots and hunter reports into areas: everything
            within about 12 miles (20 km) of the busiest spot, named after the nearest town. Then it ranks
            them. What you pick changes the answer:
          </p>
          <Terms items={[
            ['Species', <>Only that species’ counts and that species’ season. “All waterfowl” counts every duck and goose and checks the duck and goose seasons.</>],
            ['Hunt date', <>Decides which seasons are open in each area’s zone that day. Bird counts are always the latest, whatever the date.</>],
            ['States', <>Which states to search. With several states picked, you get each state’s best area first, then each state’s second best, and so on.</>],
            ['Your location', <>Optional. Adds the distance to each area, and lets you sort by nearest instead of best.</>],
          ]} />
          <p><Strong>How an area is ranked.</Strong> Four things, multiplied together:</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <Strong>Birds counted</Strong> in the area: the biggest of its survey count, its eBird
              reports and its hunter reports. Not all three added up, because a birder at the refuge
              overlook and the survey plane are often counting the same ducks.
            </li>
            <li>
              <Strong>Which way the counts are moving</Strong> since each site’s previous survey. Rising
              counts can lift an area by up to half again; falling counts lower it by up to a quarter.
            </li>
            <li><Strong>Weather push</Strong> in that area’s region: up to 30% more for a strong push (see <a href="#weather" className="text-accent-600 dark:text-accent-400 hover:underline">Weather push</a>).</li>
            <li>
              <Strong>The season.</Strong> An area whose season is closed on your hunt date drops to a
              quarter of its score. It stays on the list so you can see it, it just sinks.
            </li>
          </ol>
          <p>
            Areas known only from birders’ reports, with no survey site, hunter report or public land
            nearby, sink too (to a fifth). These are usually city parks and suburban lakes: real birds, but
            nowhere to hunt.
          </p>
          <p><Strong>Access.</Strong> Refuges and survey sites that are closed to waterfowl hunting or private
            still count as birds in the area, but they’re never listed as somewhere to hunt. Public land
            near each area comes from the USGS Protected Areas Database. It tells you the land is public,
            not what it allows, so check that unit’s hunting rules.</p>
          <p><Strong>The reasons on each card</Strong> are the actual evidence behind the rank: birds at
            survey sites, the change since the last survey, eBird hotspots, hunter reports, a cold front,
            and the state’s statewide survey if it has one.</p>
        </Section>

        <Section id="migration" title="Migration page">
          <p>
            The Migration page shows the newest count at each site. A site’s <em>change</em> compares its
            newest survey with the one before, if that one is within 3 weeks. Every label comes from that
            change:
          </p>
          <Terms items={[
            ['Arriving', <>Counts up more than 20% since the previous survey.</>],
            ['Building', <>Counts up, by 5 to 20%.</>],
            ['Peak', <>Counts steady, within 5% either way.</>],
            ['Declining', <>Counts down, by 5 to 20%.</>],
            ['Departing', <>Counts down more than 20%.</>],
            ['New data', <>A first survey, or nothing recent to compare it with.</>],
            ['Spike', <>Up 30% or more, with at least 500 birds now. Worth a look.</>],
            ['Sharp decline', <>Down 40% or more from at least 500 birds.</>],
            ['Old data', <>No survey in the last 4 weeks (or last season’s). It’s shown, but left out of the current totals.</>],
          ]} />
          <p><Strong>State cards</Strong> are ordered by how much each state’s counts rose, not by size.
            A rise measured at only one or two sites counts for less than one seen across three or more,
            so one small refuge doubling doesn’t put its whole state on top.</p>
          <p><Strong>This Weekend</Strong> picks one state the same way: rising counts, a spike, birds
            arriving, and that state’s own weather. Total birds only break a tie. A state with only old
            data is never the pick.</p>
          <p><Strong>Migration Index</Strong> (0 to 100) sums up the whole picture this week: how many
            sites are rising (up to 25 points), how fast (20), the weather push (15), eBird activity across
            states (25) and spikes minus sharp declines (15). Under 26 is Quiet, 26 to 50 Active, 51 to 75
            Strong, and 76 or more Peak Movement.</p>
        </Section>

        <Section id="weather" title="Weather push">
          <p>
            Birds move south ahead of and behind cold fronts. HuntStack scores each region’s forecast
            from 0 to 3:
          </p>
          <Terms items={[
            ['Cold front now', <>+1: a temperature drop of 10°F or more within the next 24 hours.</>],
            ['Front on the way', <>+½: the same drop within 48 hours instead.</>],
            ['North wind', <>+1: wind from the north, northwest or northeast.</>],
            ['Below freezing', <>+1: under 32°F, which starts freezing up the water farther north.</>],
          ]} />
          <p>Each signal has to show up at most of the region’s forecast points to count, so one cold
            valley doesn’t make a front.</p>
        </Section>

        <Section id="regulations" title="Regulations">
          <ul className="list-disc pl-5 space-y-2">
            <li><Strong>Your zone matters.</Strong> Many states split seasons by zone. Pick yours, or use
              your location, and the Today card shows what’s open there today and what opens or closes next.</li>
            <li><Strong>Prices are never guessed.</Strong> “What you need to buy” adds up only prices the
              agency published. A missing price says “Price not listed”, and the total then reads “At least $X”.</li>
            <li><Strong>Dates and limits come from the agency</Strong> for the current season, with a link to
              the source. Regulations change mid-season sometimes, so the agency’s page is the final word.</li>
          </ul>
        </Section>

        <Section id="ask-ai" title="Ask AI">
          <p>
            Ask AI searches the web and HuntStack’s own data for each question. Where they disagree on
            season dates, bag limits or license prices, HuntStack’s data (from the agency) wins. Each answer
            lists its sources under “From the web” and “From HuntStack data”, so you can check them. Like any AI, it can
            be wrong: check the sources before you rely on an answer.
          </p>
        </Section>

        <Section id="limits" title="What HuntStack can’t tell you">
          <ul className="list-disc pl-5 space-y-2">
            <li>Exactly where birds are on a given morning. Counts are snapshots taken days apart.</li>
            <li>Hunting pressure, water levels, or whether a field was just cut or flooded.</li>
            <li>Private land, landowner permission, or whether a public unit is crowded.</li>
            <li>Birds in places nobody counts. A quiet area on HuntStack may just be unsurveyed.</li>
          </ul>
          <p>
            Something look wrong? Tell us on the{' '}
            <Link to="/contact" className="text-accent-600 dark:text-accent-400 hover:underline">Contact</Link> page.
            Reports from hunters in the field are how the data gets better.
          </p>
        </Section>
      </div>

      <div className="mt-12 flex flex-col sm:flex-row gap-3">
        <Link to="/where-to-hunt" className="btn-primary text-base px-5 py-3">Find where to hunt</Link>
        <Link to="/migration" className="btn-outline text-base px-5 py-3">See the migration</Link>
      </div>
    </div>
  )
}
