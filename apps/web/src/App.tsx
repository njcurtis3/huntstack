import { Component, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { MapPage } from './pages/MapPage'
import { RegulationsPage } from './pages/RegulationsPage'
import { OutfittersPage } from './pages/OutfittersPage'
import { MigrationPage } from './pages/MigrationPage'
import { MigrationReportPage } from './pages/MigrationReportPage'
import { ChatPage } from './pages/ChatPage'
import { WhereToHuntPage } from './pages/WhereToHuntPage'
import { NotFoundPage } from './pages/NotFoundPage'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: 'rgb(var(--color-bg-primary))' }}>
          <div className="max-w-md w-full text-center">
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'rgb(var(--color-text-primary))' }}>Something went wrong</h1>
            <p className="text-sm mb-6" style={{ color: 'rgb(var(--color-text-secondary))' }}>
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md text-sm font-medium bg-accent-600 hover:bg-accent-700 text-white transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/report" element={<MigrationReportPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="search" element={<Navigate to="/chat" replace />} />
          <Route path="map" element={<MapPage />} />
          <Route path="migration" element={<MigrationPage />} />
          <Route path="where-to-hunt" element={<WhereToHuntPage />} />
          <Route path="regulations" element={<RegulationsPage />} />
          <Route path="regulations/:state" element={<RegulationsPage />} />
          <Route path="outfitters" element={<OutfittersPage />} />
          <Route path="outfitters/:id" element={<OutfittersPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}

export default App
