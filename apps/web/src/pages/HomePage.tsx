import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, TrendingUp, MapPin, Send } from 'lucide-react'

// The home page is only the name, the search bar and the two main tools, centered on one screen.
export function HomePage() {
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')

  const ask = (text: string) => {
    const q = text.trim()
    if (!q) return
    navigate(`/chat?q=${encodeURIComponent(q)}`)
  }

  return (
    <section
      className="relative overflow-hidden min-h-[calc(100svh-3.5rem)] flex items-center"
      style={{ backgroundColor: `rgb(var(--color-bg-primary))`, color: `rgb(var(--color-text-primary))` }}
    >
      {/* Topo background: real contour lines (8 m) of the Illinois-Mississippi confluence at
          Grafton, IL, from public elevation data (scripts/build-topo-background.py). One copy per
          theme with its color baked in, swapped by opacity, each on its own compositor layer
          (will-change) so the 0.3 s theme color transition never redraws the lines; a mask colored
          by a theme variable was re-rasterized on every frame of it, which made switching slow. */}
      <img src="/topo-grafton-light.svg" alt="" aria-hidden="true" decoding="async"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover [will-change:transform] opacity-[0.14] dark:opacity-0" />
      <img src="/topo-grafton-dark.svg" alt="" aria-hidden="true" decoding="async"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover [will-change:transform] opacity-0 dark:opacity-[0.16]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 55% 50% at 50% 50%, rgb(var(--color-bg-primary)) 0%, rgb(var(--color-bg-primary) / 0) 100%)` }} />
      <div className="relative w-full max-w-2xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center">
        <h1 className="flex items-center gap-3 sm:gap-4">
          <img src="/duck-image-1.png" alt="" aria-hidden="true" className="w-12 h-12 sm:w-16 sm:h-16 dark:invert" />
          <span className="text-5xl sm:text-6xl font-semibold tracking-[-0.035em]">huntstack</span>
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(question)
          }}
          className="mt-10 w-full"
          role="search"
        >
          <label htmlFor="home-ask" className="sr-only">Ask anything about your hunt</label>
          <div
            className="flex flex-col sm:flex-row gap-1 p-1 rounded-md border focus-within:border-accent-500 dark:focus-within:border-accent-400"
            style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-input))` }}
          >
            <input
              id="home-ask"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about your hunt"
              maxLength={500}
              className="flex-1 min-w-0 rounded-sm px-3 py-3 text-base bg-transparent focus:outline-none placeholder:text-[rgb(var(--color-text-tertiary))]"
              style={{ color: `rgb(var(--color-text-primary))` }}
            />
            <button
              type="submit"
              disabled={!question.trim()}
              className="btn-primary text-base px-5 py-3 rounded-sm disabled:opacity-50"
            >
              <Send className="mr-2 w-4 h-4" />
              Ask
            </button>
          </div>
        </form>

        <div className="mt-6 w-full flex flex-col sm:flex-row sm:justify-center gap-3">
          <Link to="/where-to-hunt" className="btn-primary text-base px-5 py-3">
            <MapPin className="mr-2 w-5 h-5" />
            Where to Hunt
          </Link>
          <Link to="/migration" className="btn-outline text-base px-5 py-3">
            <TrendingUp className="mr-2 w-5 h-5" />
            Migration
            <ArrowRight className="ml-2 w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
