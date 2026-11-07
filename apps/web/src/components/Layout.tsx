import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  Home,
  Map,
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
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useThemeStore } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { AuthModal } from './AuthModal'
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

const secondaryNav = [
  { name: 'Map', href: '/map', icon: Map },
  { name: 'Outfitters', href: '/outfitters', icon: Users },
]

// Combined for mobile (Home first, then primary, then secondary)
const mobileNav = [
  { name: 'Home', href: '/', icon: Home },
  ...primaryNav,
  ...secondaryNav,
]

// Where hunters are looking at birds, so where "Report birds" is offered.
const reportRoutes = ['/migration', '/where-to-hunt', '/map']

export function Layout() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)
  const { resolvedTheme, setTheme } = useThemeStore()
  const { user, isAuthenticated, initialize, logout } = useAuthStore()
  const [reportOpen, setReportOpen] = useState(false)
  // Set when a signed-out user taps Report birds: the sheet opens once sign-in lands.
  const [reportPending, setReportPending] = useState(false)
  const showReport = reportRoutes.includes(location.pathname.replace(/\/+$/, ''))
  const onMigration = location.pathname.startsWith('/migration')

  useEffect(() => {
    initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div className="min-h-screen flex flex-col">
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
              <img src="/duck-image-1.png" alt="HuntStack" className="w-8 h-8" />
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
                  className="btn-primary text-sm min-h-11 inline-flex items-center gap-1.5"
                >
                  <Bird className="w-4 h-4" />
                  Report birds
                </button>
              )}
              {isAuthenticated && user ? (
                <>
                  <span className="text-sm truncate max-w-[10rem]" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                    {user.email}
                  </span>
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
                className="p-2 rounded-md hover:bg-earth-100 dark:hover:bg-earth-800"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
                <button
                  onClick={() => {
                    logout()
                    setMobileMenuOpen(false)
                  }}
                  className="btn-outline text-sm flex-1"
                >
                  Sign Out ({user.email})
                </button>
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

      {/* Beta notice — the data has legal stakes and testers need a way to report problems; dismissible per browser */}
      <DismissibleNotice
        id="beta-disclaimer"
        className="border-b bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50"
        innerClassName="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 text-xs sm:text-sm text-amber-800 dark:text-amber-200"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="flex-1 min-w-0">
            <span className="font-semibold">Beta.</span>{' '}
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
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer — GitHub-style */}
      <footer className="border-t" style={{ backgroundColor: `rgb(var(--color-bg-secondary))`, borderColor: `rgb(var(--color-border-primary))` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Hunters</h3>
              <ul className="space-y-2 text-sm">
                <li><Link to="/where-to-hunt" className="text-accent-500 hover:underline">Where to Hunt</Link></li>
                <li><Link to="/map" className="text-accent-500 hover:underline">Explore Map</Link></li>
                <li><Link to="/migration" className="text-accent-500 hover:underline">Migration</Link></li>
                <li><Link to="/regulations" className="text-accent-500 hover:underline">Regulations</Link></li>
                <li><Link to="/chat" className="text-accent-500 hover:underline">Ask AI</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Outfitters</h3>
              <ul className="space-y-2 text-sm">
                <li><Link to="/outfitters/list-your-business" className="text-accent-500 hover:underline">List Your Business</Link></li>
                <li><Link to="/outfitters/reg-alerts" className="text-accent-500 hover:underline">Reg Alerts</Link></li>
                <li><Link to="/outfitters/dashboard" className="text-accent-500 hover:underline">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Resources</h3>
              <ul className="space-y-2 text-sm">
                <li><Link to="/blog" className="text-accent-500 hover:underline">Blog</Link></li>
                <li><Link to="/data-sources" className="text-accent-500 hover:underline">Data Sources</Link></li>
                <li><Link to="/developers" className="text-accent-500 hover:underline">API</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Company</h3>
              <ul className="space-y-2 text-sm">
                <li><Link to="/about" className="text-accent-500 hover:underline">About</Link></li>
                <li><Link to="/contact" className="text-accent-500 hover:underline">Contact</Link></li>
                <li><a href={feedbackMailto(typeof window !== 'undefined' ? window.location.href : location.pathname)} className="text-accent-500 hover:underline">Send Feedback</a></li>
                <li><Link to="/privacy" className="text-accent-500 hover:underline">Privacy</Link></li>
                <li><Link to="/terms" className="text-accent-500 hover:underline">Terms</Link></li>
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
      </footer>

      {/* Mobile: Report FAB. On /migration it stacks above that page's Ask HuntStack AI button. */}
      {showReport && !reportOpen && (
        <button
          onClick={openReport}
          className="md:hidden fixed right-4 z-40 flex items-center gap-2 px-4 min-h-12 rounded-full shadow-lg text-white text-base font-medium"
          style={{
            backgroundColor: 'rgb(var(--color-accent-600, 5 150 105))',
            bottom: `calc(${onMigration ? '5.5rem' : '1rem'} + env(safe-area-inset-bottom))`,
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
