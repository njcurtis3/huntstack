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
  Moon
} from 'lucide-react'
import { useState } from 'react'
import { useThemeStore } from '../stores/themeStore'

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Search', href: '/search', icon: Search },
  { name: 'Map', href: '/map', icon: Map },
  { name: 'Migration', href: '/migration', icon: Bird },
  { name: 'Regulations', href: '/regulations', icon: FileText },
  { name: 'Outfitters', href: '/outfitters', icon: Users },
  { name: 'Ask AI', href: '/chat', icon: MessageSquare },
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
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <img src="/duck-image-1.png" alt="HuntStack" className="w-8 h-8" />
              <span className="font-bold text-xl text-gray-900 dark:text-gray-100">huntstack</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/' && location.pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-forest-50 dark:bg-forest-950 text-forest-700 dark:text-forest-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Auth Buttons + Theme Toggle */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
              <button
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
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
          <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <nav className="px-4 py-3 space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                      isActive
                        ? 'bg-forest-50 dark:bg-forest-950 text-forest-700 dark:text-forest-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-3">
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

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-white font-semibold mb-4">Hunters</h3>
              <ul className="space-y-2 text-sm">
                <li><Link to="/search" className="hover:text-white">Find Hunts</Link></li>
                <li><Link to="/map" className="hover:text-white">Explore Map</Link></li>
                <li><Link to="/migration" className="hover:text-white">Migration</Link></li>
                <li><Link to="/regulations" className="hover:text-white">Regulations</Link></li>
                <li><Link to="/chat" className="hover:text-white">Ask AI</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Outfitters</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">List Your Business</a></li>
                <li><a href="#" className="hover:text-white">Reg Alerts</a></li>
                <li><a href="#" className="hover:text-white">Dashboard</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#" className="hover:text-white">Data Sources</a></li>
                <li><a href="#" className="hover:text-white">API</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
                <li><a href="#" className="hover:text-white">Privacy</a></li>
                <li><a href="#" className="hover:text-white">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-sm text-center">
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
