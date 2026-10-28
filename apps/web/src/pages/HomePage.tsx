import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, TrendingUp, MapPin, FileText, MessageSquare, Bird, Zap, BarChart2, Compass, Send } from 'lucide-react'

// Planning steps, in the order a hunter works through them.
const steps = [
  {
    icon: FileText,
    question: 'Is it open?',
    title: 'Regulations',
    description: 'Season dates by zone, bag limits and licenses, entered from each state agency with a link to the source.',
    href: '/regulations',
    cta: 'Check seasons',
  },
  {
    icon: Bird,
    question: 'Are the birds there?',
    title: 'Migration',
    description: 'Refuge and aerial survey counts, week-over-week changes and cold-front push scores across both flyways.',
    href: '/migration',
    cta: 'See migration',
  },
  {
    icon: Compass,
    question: 'Is this weekend worth it?',
    title: 'Where to Hunt',
    description: 'Public areas near you ranked by bird numbers, open seasons, hunt-day weather and distance.',
    href: '/where-to-hunt',
    cta: 'Find a spot',
  },
  {
    icon: MessageSquare,
    question: 'Anything else?',
    title: 'Ask',
    description: 'Ask in plain language. Answers search the web and check it against our season and survey data, with sources.',
    href: '/chat',
    cta: 'Ask a question',
  },
]

// Keep these true: check against the database when the data grows.
const stats = [
  { value: '6', label: 'States with full season rules' },
  { value: '5,200+', label: 'Survey counts' },
  { value: '1997', label: 'Survey history back to' },
  { value: '2', label: 'Flyways' },
]

const flyways = [
  { name: 'Central Flyway', states: 'TX · OK · KS · NM', note: null, color: 'text-forest-400' },
  { name: 'Mississippi Flyway', states: 'AR · LA', note: 'Survey counts also for MO · IL', color: 'text-accent-400' },
]

const exampleQuestions = [
  'Is duck season open in the Kansas Low Plains this weekend?',
  'Where should I hunt snow geese near Amarillo?',
  'What is the duck bag limit in Arkansas?',
]

export function HomePage() {
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')

  const ask = (text: string) => {
    const q = text.trim()
    if (!q) return
    navigate(`/chat?q=${encodeURIComponent(q)}`)
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-earth-900 dark:bg-[#0d1117] border-b border-earth-800 dark:border-[#21262d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-2xl">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-forest-700 bg-forest-900/40 mb-6">
              <span className="w-2 h-2 rounded-full bg-forest-400 animate-pulse" />
              <span className="text-xs font-medium text-forest-300 tracking-wide uppercase">Central &amp; Mississippi Flyways</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white">
              Plan your next duck hunt
              <span className="text-forest-400">.</span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-earth-300 leading-relaxed">
              Season dates, bird counts and hunt-day weather in one place, instead of a dozen agency
              websites and PDFs.
            </p>

            {/* Ask box */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                ask(question)
              }}
              className="mt-8"
            >
              <label htmlFor="home-ask" className="sr-only">Ask a question about your hunt</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="home-ask"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask anything about your hunt"
                  maxLength={500}
                  className="flex-1 min-w-0 rounded-md px-4 py-3 text-base bg-white/10 text-white placeholder-earth-400 border border-white/20 focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
                <button
                  type="submit"
                  disabled={!question.trim()}
                  className="btn-primary text-base px-5 py-3 inline-flex items-center justify-center disabled:opacity-50"
                >
                  <Send className="mr-2 w-4 h-4" />
                  Ask
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {exampleQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="text-left text-sm px-3 py-1.5 rounded-full border border-white/15 text-earth-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </form>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/where-to-hunt" className="btn-primary text-base px-6 py-3 inline-flex items-center justify-center">
                <MapPin className="mr-2 w-5 h-5" />
                Where to Hunt
              </Link>
              <Link
                to="/migration"
                className="btn inline-flex items-center justify-center bg-white/10 text-white hover:bg-white/20 border border-white/20 text-base px-6 py-3"
              >
                <TrendingUp className="mr-2 w-5 h-5" />
                Migration
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section
        className="border-b"
        style={{
          backgroundColor: `rgb(var(--color-bg-secondary))`,
          borderColor: `rgb(var(--color-border-primary))`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 md:divide-x">
            {stats.map((stat) => (
              <div key={stat.label} className="px-2 md:px-6 text-center">
                <div className="text-2xl font-bold text-forest-500 dark:text-forest-400">{stat.value}</div>
                <div className="text-sm mt-0.5" style={{ color: `rgb(var(--color-text-secondary))` }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planning steps */}
      <section className="py-16 md:py-20" style={{ backgroundColor: `rgb(var(--color-bg-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h2 className="text-2xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
              Everything you check before you leave the truck
            </h2>
            <p className="mt-2 text-base" style={{ color: `rgb(var(--color-text-secondary))` }}>
              The questions every waterfowl hunt starts with, answered from agency rules, survey counts and the forecast.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {steps.map((s) => (
              <Link
                key={s.title}
                to={s.href}
                className="group rounded-lg border p-6 transition-colors hover:border-forest-500/50 dark:hover:border-forest-600/50"
                style={{
                  backgroundColor: `rgb(var(--color-bg-elevated))`,
                  borderColor: `rgb(var(--color-border-primary))`,
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-2 rounded-md bg-forest-900/30 dark:bg-forest-900/50 border border-forest-800/40">
                    <s.icon className="w-5 h-5 text-forest-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-base" style={{ color: `rgb(var(--color-text-primary))` }}>
                        {s.question}
                      </h3>
                      <ArrowRight
                        className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-forest-400"
                      />
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-wide mt-0.5" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                      {s.title}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: `rgb(var(--color-text-secondary))` }}>
                      {s.description}
                    </p>
                    <span className="mt-3 inline-block text-sm font-medium text-forest-500 dark:text-forest-400">
                      {s.cta} →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Flyway coverage */}
      <section
        className="border-t border-b py-12"
        style={{
          backgroundColor: `rgb(var(--color-bg-secondary))`,
          borderColor: `rgb(var(--color-border-primary))`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center gap-8">
            <div className="md:w-1/3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-forest-400" />
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                  Coverage
                </span>
              </div>
              <h2 className="text-xl font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
                Central &amp; Mississippi Flyways
              </h2>
              <p className="mt-2 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
                Six states have full seasons, regulations and survey counts today. More survey sites and states
                across both flyways are on the way.
              </p>
            </div>
            <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {flyways.map((fw) => (
                <div
                  key={fw.name}
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: `rgb(var(--color-bg-elevated))`,
                    borderColor: `rgb(var(--color-border-primary))`,
                  }}
                >
                  <div className={`text-sm font-semibold ${fw.color}`}>{fw.name}</div>
                  <div className="mt-1 text-sm font-mono tracking-wide" style={{ color: `rgb(var(--color-text-secondary))` }}>
                    {fw.states}
                  </div>
                  {fw.note && (
                    <div className="mt-1 text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                      {fw.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Migration strip */}
      <section className="py-14" style={{ backgroundColor: `rgb(var(--color-bg-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
            style={{
              backgroundColor: `rgb(var(--color-bg-secondary))`,
              borderColor: `rgb(var(--color-border-primary))`,
            }}
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="w-4 h-4 text-forest-400" />
                <span className="text-xs font-semibold uppercase tracking-widest text-forest-500 dark:text-forest-400">Live Data</span>
              </div>
              <h3 className="text-lg font-bold" style={{ color: `rgb(var(--color-text-primary))` }}>
                See what's moving right now
              </h3>
              <p className="mt-1 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
                Survey counts from USFWS refuges and state agencies, plus eBird sightings, with cold-front push scores.
              </p>
            </div>
            <div className="flex-shrink-0">
              <Link to="/migration" className="btn-primary inline-flex items-center px-5 py-2.5 text-sm">
                <TrendingUp className="mr-2 w-4 h-4" />
                Open Migration
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
