import { Link } from 'react-router-dom'

export function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-8" style={{ color: `rgb(var(--color-text-primary))` }}>
        About HuntStack
      </h1>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: `rgb(var(--color-text-secondary))` }}>
        <p>
          I built HuntStack because I was tired of doing the same thing every hunter does the week before a
          trip: opening a dozen browser tabs and slowly piecing together information that should have taken
          five minutes to find.
        </p>

        <p>
          Every state agency runs its regulations a different way. One state buries seasons in a PDF that
          gets re-uploaded every August with no changelog. Another has a "season lookup tool" that only
          works if you already know the unit number you're looking for. A third splits bag limits,
          shooting hours, and stamp requirements across three separate pages that don't link to each other.
          None of them agree on layout, none of them are built for someone trying to compare options across
          states, and all of them assume you already know exactly what you're looking for before you start.
        </p>

        <p>
          Migration data was worse. Refuge counts live on individual refuge pages, updated on their own
          schedule, in their own format — sometimes a table, sometimes a PDF, sometimes a paragraph of
          prose you have to read closely to find the actual numbers in. Flight and flyway progression isn't
          published anywhere as a single picture; you have to mentally stitch it together from counts at
          different refuges, weeks apart. Weather that actually matters for hunting — the cold front that's
          going to push birds south, the wind direction that makes a spot worth sitting — is a separate
          lookup from all of that. And the most current, boots-on-the-ground read on bird activity usually
          isn't in any of these official sources at all — it's in a Facebook group or a forum thread, said
          by someone who was actually there.
        </p>

        <p>
          None of that is hard information to find because it's secret. It's hard because it's scattered
          across dozens of differently-built websites, each with their own quirks, none of them talking to
          each other. I wanted one place that already did the work of pulling it together — regulations,
          migration and refuge counts, weather, and community reports on bird activity — so I could spend
          my prep time deciding where to hunt, not hunting for information.
        </p>

        <p>
          That's what HuntStack is: a single, searchable, AI-queryable view over the same public data
          that's always been out there, just never in one place. It doesn't replace in-field tools like
          OnX or HuntStand — it's built for the part that happens before you leave the house, deciding
          where and when it's worth going.
        </p>

        <p>
          It's early. Waterfowl and a handful of states come first, because that's where I saw the gap
          most clearly, and because trying to cover everything at once usually means covering nothing
          well. See the{' '}
          <Link to="/data-sources" className="text-accent-500 hover:underline">Data Sources</Link> page
          for exactly what's aggregated today and where it comes from.
        </p>

        <p>
          If you're a hunter and something here is wrong, missing, or just annoying, I want to hear about
          it — <Link to="/contact" className="text-accent-500 hover:underline">reach out</Link>.
        </p>
      </div>
    </div>
  )
}
