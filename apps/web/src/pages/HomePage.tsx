import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, TrendingUp, MapPin, Send } from 'lucide-react'

// Planning steps, in the order a hunter works through them.
const steps = [
  {
    question: 'Is it open?',
    title: 'Regulations',
    description: 'Season dates by zone, bag limits and licenses, entered from each state agency with a link to the source.',
    href: '/regulations',
    cta: 'Check seasons',
  },
  {
    question: 'Are the birds there?',
    title: 'Migration',
    description: 'Refuge and aerial survey counts, week-over-week changes and cold-front push scores across both flyways.',
    href: '/migration',
    cta: 'See migration',
  },
  {
    question: 'Is this weekend worth it?',
    title: 'Where to Hunt',
    description: 'Survey sites and refuges ranked by bird numbers, open seasons and hunt-day weather, with hunting access shown for each.',
    href: '/where-to-hunt',
    cta: 'Find a spot',
  },
  {
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
  { name: 'Central Flyway', states: 'TX · OK · KS · NM', note: null },
  { name: 'Mississippi Flyway', states: 'AR · LA', note: 'Survey counts only (no season dates yet): MO · IL · IA' },
]

const exampleQuestions = [
  'Is duck season open in the Kansas Low Plains this weekend?',
  'Where are the most ducks being counted this week?',
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
      <section className="bg-earth-900 dark:bg-[#121416] border-b border-earth-800 dark:border-[#24272b] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-14 md:pt-24 md:pb-20">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-wide text-accent-400 mb-5">
              Central &amp; Mississippi Flyways
            </p>

            <h1 className="text-4xl md:text-6xl font-semibold leading-[1.02] tracking-[-0.035em] text-white">
              Plan your hunt.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-[#a7adb4] leading-relaxed max-w-2xl">
              Season dates, bird counts and hunt-day weather in one place, instead of a dozen agency
              websites and PDFs.
            </p>

            {/* Ask box */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                ask(question)
              }}
              className="mt-9"
            >
              <label htmlFor="home-ask" className="sr-only">Ask a question about your hunt</label>
              <div className="flex flex-col sm:flex-row gap-1 p-1 rounded-md border border-[#3a3e44] bg-[#1a1d20] focus-within:border-accent-400">
                <input
                  id="home-ask"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask anything about your hunt"
                  maxLength={500}
                  className="flex-1 min-w-0 rounded-sm px-3 py-3 text-base bg-transparent text-white placeholder-[#8a9098] focus:outline-none"
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
              <div className="mt-3 flex flex-col items-start">
                {exampleQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="text-left text-sm py-1.5 text-[#a7adb4] hover:text-white hover:underline underline-offset-4 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </form>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/where-to-hunt" className="btn-primary text-base px-5 py-3">
                <MapPin className="mr-2 w-5 h-5" />
                Where to Hunt
              </Link>
              <Link to="/migration" className="btn-ghost-dark text-base px-5 py-3">
                <TrendingUp className="mr-2 w-5 h-5" />
                Migration
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="border-t border-[#26292d] dark:border-[#24272b]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-x-6">
            {stats.map((stat) => (
              <div key={stat.label} className="py-6">
                <div className="font-mono text-2xl md:text-3xl font-medium text-white">{stat.value}</div>
                <div className="text-[13px] mt-1 text-[#a7adb4]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planning steps */}
      <section className="py-16 md:py-20" style={{ backgroundColor: `rgb(var(--color-bg-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <h2 className="text-2xl md:text-[32px] font-semibold tracking-tight leading-tight" style={{ color: `rgb(var(--color-text-primary))` }}>
              Everything you check before you leave the truck
            </h2>
            <p className="mt-2.5 text-base" style={{ color: `rgb(var(--color-text-secondary))` }}>
              The questions every waterfowl hunt starts with, answered from agency rules, survey counts and the forecast.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((s) => (
              <Link
                key={s.title}
                to={s.href}
                className="group flex flex-col gap-2 pt-4 border-t-2 border-earth-900 dark:border-earth-200 hover:border-accent-500 dark:hover:border-accent-400 transition-colors"
              >
                <span className="eyebrow">{s.title}</span>
                <h3 className="font-semibold text-lg" style={{ color: `rgb(var(--color-text-primary))` }}>
                  {s.question}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: `rgb(var(--color-text-secondary))` }}>
                  {s.description}
                </p>
                <span className="mt-1 text-sm font-semibold text-accent-600 dark:text-accent-400 group-hover:underline underline-offset-4">
                  {s.cta} →
                </span>
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
          <div className="flex flex-col md:flex-row md:items-start gap-8">
            <div className="md:w-1/3">
              <p className="eyebrow mb-2">Coverage</p>
              <h2 className="text-xl font-semibold tracking-tight" style={{ color: `rgb(var(--color-text-primary))` }}>
                Central &amp; Mississippi Flyways
              </h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: `rgb(var(--color-text-secondary))` }}>
                Six states have full seasons, regulations and survey counts today. Missouri, Illinois and Iowa
                have survey counts but no season dates yet. Outfitter listings are Texas only for now.
              </p>
            </div>
            <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {flyways.map((fw) => (
                <div key={fw.name} className="card p-4">
                  <div className="text-sm font-semibold" style={{ color: `rgb(var(--color-text-primary))` }}>{fw.name}</div>
                  <div className="mt-1.5 text-sm font-mono" style={{ color: `rgb(var(--color-text-secondary))` }}>
                    {fw.states}
                  </div>
                  {fw.note && (
                    <div className="mt-1.5 text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
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
          <div
            className="border-y py-7 flex flex-col md:flex-row md:items-center justify-between gap-6"
            style={{ borderColor: `rgb(var(--color-border-primary))` }}
          >
            <div>
              <p className="eyebrow text-accent-600 dark:text-accent-400 mb-1.5">Live Data</p>
              <h3 className="text-xl font-semibold tracking-tight" style={{ color: `rgb(var(--color-text-primary))` }}>
                See what's moving right now
              </h3>
              <p className="mt-1.5 text-sm" style={{ color: `rgb(var(--color-text-secondary))` }}>
                Survey counts from USFWS refuges and state agencies, plus eBird sightings, with cold-front push scores.
              </p>
            </div>
            <div className="flex-shrink-0">
              <Link to="/migration" className="btn-primary px-5 py-3 text-[15px]">
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
