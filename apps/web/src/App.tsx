import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { SearchPage } from './pages/SearchPage'
import { MapPage } from './pages/MapPage'
import { RegulationsPage } from './pages/RegulationsPage'
import { OutfittersPage } from './pages/OutfittersPage'
import { MigrationPage } from './pages/MigrationPage'
import { ChatPage } from './pages/ChatPage'
import { WhereToHuntPage } from './pages/WhereToHuntPage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
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
  )
}

export default App
