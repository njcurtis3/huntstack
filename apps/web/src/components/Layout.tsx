import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  Home,
  Search,
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
} from 'lucide-react'
import { useState } from 'react'
import { useThemeStore } from '../stores/themeStore'

const primaryNav = [
  { name: 'Migration', href: '/migration', icon: Bird },
  { name: 'Where to Hunt', href: '/where-to-hunt', icon: Crosshair },
]

const secondaryNav = [
  { name: 'Regulations', href: '/regulations', icon: FileText },
  { name: 'Ask AI', href: '/chat', icon: MessageSquare },
  { name: 'Search', href: '/search', icon: Search },
  { name: 'Outfitters', href: '/outfitters', icon: Users },
  { name: 'Map', href: '/map', icon: Map },
]

// Combined for mobile (Home first, then primary, then secondary)
const mobileNav = [
  { name: 'Home', href: '/', icon: Home },
  ...primaryNav,
  ...secondaryNav,
]

export function Layout() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { resolvedTheme, setTheme } = useThemeStore()

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
              {/* Primary nav — Migration + Where to Hunt */}
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
              <button className="btn-outline text-sm">Sign In</button>
              <button className="btn-primary text-sm">Sign Up</button>
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
              <button className="btn-outline text-sm flex-1">Sign In</button>
              <button className="btn-primary text-sm flex-1">Sign Up</button>
            </div>
          </div>
        )}
      </header>

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
                <li><Link to="/search" className="text-accent-500 hover:underline">Search</Link></li>
                <li><Link to="/map" className="text-accent-500 hover:underline">Explore Map</Link></li>
                <li><Link to="/migration" className="text-accent-500 hover:underline">Migration</Link></li>
                <li><Link to="/regulations" className="text-accent-500 hover:underline">Regulations</Link></li>
                <li><Link to="/chat" className="text-accent-500 hover:underline">Ask AI</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Outfitters</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-accent-500 hover:underline">List Your Business</a></li>
                <li><a href="#" className="text-accent-500 hover:underline">Reg Alerts</a></li>
                <li><a href="#" className="text-accent-500 hover:underline">Dashboard</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Resources</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-accent-500 hover:underline">Blog</a></li>
                <li><a href="#" className="text-accent-500 hover:underline">Data Sources</a></li>
                <li><a href="#" className="text-accent-500 hover:underline">API</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: `rgb(var(--color-text-primary))` }}>Company</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-accent-500 hover:underline">About</a></li>
                <li><a href="#" className="text-accent-500 hover:underline">Contact</a></li>
                <li><a href="#" className="text-accent-500 hover:underline">Privacy</a></li>
                <li><a href="#" className="text-accent-500 hover:underline">Terms</a></li>
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
    </div>
  )
}
