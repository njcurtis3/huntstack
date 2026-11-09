import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  Home,
  Bird,
  FileText,
  Users,
  MessageSquare,
  Menu,
  X,
  Sun,
  Moon,
  Crosshair,
  AlertCircle,
  Settings,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useThemeStore } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { AuthModal, type AuthMode } from './AuthModal'
import { FieldReportSheet } from './FieldReportSheet'
import { DismissibleNotice } from './DismissibleNotice'
import { feedbackMailto } from '../lib/contact'

// In the order a hunter plans: where, are birds there, is it legal, anything else.
const primaryNav = [
  { name: 'Where to Hunt', href: '/where-to-hunt', icon: Crosshair },
  { name: 'Migration', href: '/migration', icon: Bird },
  { name: 'Regulations', href: '/regulations', icon: FileText },
  { name: 'Ask AI', href: '/chat', icon: MessageSquare },
]

// The Map page is a "coming soon" placeholder: reachable by URL, not linked until it's built
const secondaryNav = [
  { name: 'Outfitters', href: '/outfitters', icon: Users },
]

// Combined for mobile (Home first, then primary, then secondary)
const mobileNav = [
  { name: 'Home', href: '/', icon: Home },
  ...primaryNav,
  ...secondaryNav,
]

// Where hunters are looking at birds, so where "Report birds" is offered.
const reportRoutes = ['/migration', '/where-to-hunt']

// Browser tab titles, so tabs, history and bookmarks can be told apart.
const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'HuntStack - Plan your hunt'],
  [/^\/where-to-hunt/, 'Where to Hunt'],
  [/^\/migration/, 'Migration'],
  [/^\/regulations/, 'Regulations'],
  [/^\/chat/, 'Ask AI'],
  [/^\/outfitters\/list-your-business/, 'List Your Business'],
  [/^\/outfitters\/dashboard/, 'Outfitter Dashboard'],
  [/^\/outfitters\/reg-alerts/, 'Regulation Alerts'],
  [/^\/outfitters/, 'Outfitters'],
  [/^\/map/, 'Map'],
  [/^\/data-sources/, 'Data Sources'],
  [/^\/developers/, 'API'],
  [/^\/about/, 'About'],
  [/^\/contact/, 'Contact'],
  [/^\/blog/, 'Blog'],
  [/^\/privacy/, 'Privacy'],
  [/^\/terms/, 'Terms'],
  [/^\/admin/, 'Admin'],
  [/^\/settings/, 'Settings'],
]

function pageTitleFor(pathname: string): string {
  const hit = PAGE_TITLES.find(([re]) => re.test(pathname))
  if (!hit) return 'Page not found - HuntStack'
  return pathname === '/' ? hit[1] : `${hit[1]} - HuntStack`
}

export function Layout() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [authModal, setAuthModal] = useState<AuthMode | null>(null)
  const { resolvedTheme, setTheme } = useThemeStore()
  const { user, isAuthenticated, initialize, logout, passwordRecovery, authPrompt, clearAuthPrompt } = useAuthStore()
  const [reportOpen, setReportOpen] = useState(false)
  // Set when a signed-out user taps Report birds: the sheet opens once sign-in lands.
  const [reportPending, setReportPending] = useState(false)
  const showReport = reportRoutes.includes(location.pathname.replace(/\/+$/, ''))
  // Chat fills the screen under the header and scrolls inside itself, with no footer below
  const fullHeight = location.pathname.startsWith('/chat')

  useEffect(() => {
    initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arrived from a password-reset email: ask for the new password
  useEffect(() => {
    if (passwordRecovery) setAuthModal('newpassword')
  }, [passwordRecovery])

  // Another page asked for the sign-in box
  useEffect(() => {
    if (!authPrompt) return
    setAuthModal(authPrompt)
    clearAuthPrompt()
  }, [authPrompt, clearAuthPrompt])

  // A new page starts at the top (an outfitter opened from halfway down the list used to open at
  // its footer), with its own tab title, and with the phone menu closed. Search-param changes on
  // the same page (filters) keep their place.
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0)
    document.title = pageTitleFor(location.pathname)
    setMobileMenuOpen(false)
  }, [location.pathname, location.hash])

  // Hide the phone Report birds button while a page's main button is on screen (it covered
  // Find Hunts). Pages mark that button with data-fab-avoid.
  const [fabBlocked, setFabBlocked] = useState(false)
  useEffect(() => {
    setFabBlocked(false)
    if (!showReport || typeof IntersectionObserver === 'undefined') return
    let observer: IntersectionObserver | null = null
    const t = window.setTimeout(() => {
      const targets = document.querySelectorAll('[data-fab-avoid]')
      if (targets.length === 0) return
      const visible = new Set<Element>()
      observer = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target)
          else visible.delete(e.target)
        }
        setFabBlocked(visible.size > 0)
      })
      targets.forEach(el => observer!.observe(el))
    }, 300)
    return () => {
      window.clearTimeout(t)
      observer?.disconnect()
    }
  }, [location.pathname, showReport])

  useEffect(() => {
    if (!reportPending) return
    if (isAuthenticated) {
      setReportPending(false)
      setReportOpen(true)
    } else if (!authModal) {
      // Sign-in was dismissed without signing in.
      setReportPending(false)
    }
  }, [reportPending, isAuthenticated, authModal])

  const openReport = () => {
    if (isAuthenticated) {
      setReportOpen(true)
    } else {
      setReportPending(true)
      setAuthModal('signin')
    }
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className={fullHeight ? 'h-[100dvh] flex flex-col' : 'min-h-screen flex flex-col'}>
      {/* Header — GitHub-style */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          backgroundColor: `rgb(var(--color-header-bg))`,
          borderColor: `rgb(var(--color-border-primary))`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <img src="/duck-image-1.png" alt="HuntStack" className="w-8 h-8 dark:invert" />
              <span className="font-semibold text-xl" style={{ color: `rgb(var(--color-text-primary))` }}>
                huntstack
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {/* Primary nav — the planning tools */}
              {primaryNav.map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/' && location.pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-accent-100 dark:bg-accent-900/40 text-accent-700 dark:text-accent-300'
                        : 'text-earth-800 dark:text-earth-200 hover:bg-accent-50 dark:hover:bg-accent-900/20 hover:text-accent-700 dark:hover:text-accent-300'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}

              {/* Divider */}
              <div className="h-5 w-px mx-1" style={{ backgroundColor: `rgb(var(--color-border-primary))` }} />

              {/* Secondary nav */}
              {secondaryNav.map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/' && location.pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400'
                        : 'text-earth-500 dark:text-earth-400 hover:bg-earth-100 dark:hover:bg-earth-800 hover:text-earth-900 dark:hover:text-earth-100'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Auth Buttons + Theme Toggle */}
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-earth-500 dark:text-earth-400 hover:bg-earth-100 dark:hover:bg-earth-800 transition-colors"
                aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
              {showReport && (
                <button
                  onClick={openReport}
                  data-report-trigger
                  className="btn-primary text-sm min-h-11 inline-flex items-center gap-1.5"
                >
                  <Bird className="w-4 h-4" />
                  Report birds
                </button>
              )}
              {isAuthenticated && user ? (
                <>
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-1.5 text-sm rounded-md px-2 py-1.5 hover:bg-earth-100 dark:hover:bg-earth-800"
                    style={{ color: 'rgb(var(--color-text-secondary))' }}
                    title="Settings"
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    <span className="truncate max-w-[10rem]">{user.email}</span>
                  </Link>
                  <button onClick={() => logout()} className="btn-outline text-sm">
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setAuthModal('signin')} className="btn-outline text-sm">Sign In</button>
                  <button onClick={() => setAuthModal('signup')} className="btn-primary text-sm">Sign Up</button>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-earth-500 dark:text-earth-400 hover:bg-earth-100 dark:hover:bg-earth-800 transition-colors"
                aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
              <button
                className="p-2.5 rounded-md hover:bg-earth-100 dark:hover:bg-earth-800"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div
            id="mobile-menu"
            className="md:hidden border-t"
            style={{
              backgroundColor: `rgb(var(--color-bg-elevated))`,
              borderColor: `rgb(var(--color-border-primary))`,
            }}
          >
            <nav className="px-4 py-3 space-y-1">
              {/* Primary items */}
              {mobileNav.slice(0, 3).map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/' && location.pathname.startsWith(item.href))
                const isPrimary = item.href === '/migration' || item.href === '/where-to-hunt'
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
                      isActive
                        ? 'bg-accent-100 dark:bg-accent-900/40 text-accent-700 dark:text-accent-300'
                        : isPrimary
                          ? 'text-earth-800 dark:text-earth-200 hover:bg-accent-50 dark:hover:bg-accent-900/20'
                          : 'text-earth-600 dark:text-earth-400 hover:bg-earth-100 dark:hover:bg-earth-800'
                    } ${isPrimary ? 'font-semibold' : ''}`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                )
              })}

              {/* Divider before secondary */}
              <div className="my-1 border-t" style={{ borderColor: `rgb(var(--color-border-primary))` }} />

              {/* Secondary items */}
              {mobileNav.slice(3).map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/' && location.pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
                      isActive
                        ? 'bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400'
                        : 'text-earth-500 dark:text-earth-400 hover:bg-earth-100 dark:hover:bg-earth-800'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
            <div className="px-4 py-3 border-t border-earth-200 dark:border-earth-700 flex gap-3">
              {isAuthenticated && user ? (
                <>
                  <Link
                    to="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="btn-outline text-sm flex-1 inline-flex items-center justify-center gap-1.5"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      logout()
                      setMobileMenuOpen(false)
                    }}
                    className="btn-outline text-sm flex-1"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setAuthModal('signin')
                      setMobileMenuOpen(false)
                    }}
                    className="btn-outline text-sm flex-1"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setAuthModal('signup')
                      setMobileMenuOpen(false)
                    }}
                    className="btn-primary text-sm flex-1"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Data notice — the data has legal stakes and people need a way to report problems; dismissible per browser */}
      <DismissibleNotice
        id="data-disclaimer"
        className="border-b bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50"
        innerClassName="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 text-xs sm:text-sm text-amber-800 dark:text-amber-200"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="flex-1 min-w-0">
            Season dates, bag limits and bird counts are informational and may be out of date or wrong.
            Confirm with the state wildlife agency before you hunt.{' '}
            <a
              href={feedbackMailto(typeof window !== 'undefined' ? window.location.href : location.pathname)}
              className="font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap"
            >
              Send feedback
            </a>
          </p>
        </div>
      </DismissibleNotice>

      {/* Main Content */}
      {/* On phones, room at the bottom so the Report birds button never covers the last content */}
      <main className={`flex-1 ${fullHeight ? 'min-h-0 flex flex-col' : ''} ${showReport ? 'pb-20 md:pb-0' : ''}`}>
        <Outlet />
      </main>

      {/* Footer — GitHub-style */}
      {!fullHeight && <footer className="border-t" style={{ backgroundColor: `rgb(var(--color-bg-secondary))`, borderColor: `rgb(var(--color-border-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Hunters</h3>
              <ul className="space-y-1 text-sm">
                <li><Link to="/where-to-hunt" className="inline-block py-1.5 text-accent-500 hover:underline">Where to Hunt</Link></li>
                <li><Link to="/migration" className="inline-block py-1.5 text-accent-500 hover:underline">Migration</Link></li>
                <li><Link to="/regulations" className="inline-block py-1.5 text-accent-500 hover:underline">Regulations</Link></li>
                <li><Link to="/chat" className="inline-block py-1.5 text-accent-500 hover:underline">Ask AI</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Outfitters</h3>
              <ul className="space-y-1 text-sm">
                <li><Link to="/outfitters/list-your-business" className="inline-block py-1.5 text-accent-500 hover:underline">List Your Business</Link></li>
                <li><Link to="/outfitters/dashboard" className="inline-block py-1.5 text-accent-500 hover:underline">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Resources</h3>
              <ul className="space-y-1 text-sm">
                <li><Link to="/data-sources" className="inline-block py-1.5 text-accent-500 hover:underline">Data Sources</Link></li>
                <li><Link to="/developers" className="inline-block py-1.5 text-accent-500 hover:underline">API</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Company</h3>
              <ul className="space-y-1 text-sm">
                <li><Link to="/about" className="inline-block py-1.5 text-accent-500 hover:underline">About</Link></li>
                <li><Link to="/contact" className="inline-block py-1.5 text-accent-500 hover:underline">Contact</Link></li>
                <li><a href={feedbackMailto(typeof window !== 'undefined' ? window.location.href : location.pathname)} className="inline-block py-1.5 text-accent-500 hover:underline">Send Feedback</a></li>
                <li><Link to="/privacy" className="inline-block py-1.5 text-accent-500 hover:underline">Privacy</Link></li>
                <li><Link to="/terms" className="inline-block py-1.5 text-accent-500 hover:underline">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t text-sm text-center" style={{ borderColor: `rgb(var(--color-border-primary))`, color: `rgb(var(--color-text-tertiary))` }}>
            <p>&copy; {new Date().getFullYear()} HuntStack. All rights reserved.</p>
            <p className="mt-2 text-xs">
              Data sourced from USFWS, state wildlife agencies, and other public sources.
              Always verify regulations with official sources before hunting.
            </p>
          </div>
        </div>
      </footer>}

      {/* Mobile: Report FAB. Hidden while the page's own main button is on screen. */}
      {showReport && !reportOpen && !fabBlocked && (
        <button
          onClick={openReport}
          data-report-trigger
          className="md:hidden fixed right-4 z-40 flex items-center gap-2 px-4 min-h-12 rounded-full shadow-lg text-white text-base font-medium"
          style={{
            backgroundColor: 'rgb(var(--color-accent-600, 5 150 105))',
            bottom: 'calc(1rem + env(safe-area-inset-bottom))',
          }}
        >
          <Bird className="w-5 h-5" />
          Report birds
        </button>
      )}

      {reportOpen && <FieldReportSheet onClose={() => setReportOpen(false)} />}

      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />}
    </div>
  )
}
