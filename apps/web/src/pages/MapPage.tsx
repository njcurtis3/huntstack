import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Layers, ZoomIn, ZoomOut, Locate } from 'lucide-react'

export function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      // Using MapTiler's free tier - replace with your API key
      style: 'https://api.maptiler.com/maps/outdoor-v2/style.json?key=get_your_own_key',
      center: [-98.5795, 39.8283], // Center of US
      zoom: 4,
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.current.on('load', () => {
      setMapLoaded(true)
      // TODO: Add public lands layers, hunting units, etc.
    })

    return () => {
      map.current?.remove()
    }
  }, [])

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Sidebar */}
      <div className="w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Map Layers</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Layer toggles */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-forest-600 rounded" defaultChecked />
              <span className="text-sm">Public Lands</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-forest-600 rounded" />
              <span className="text-sm">National Forests</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-forest-600 rounded" />
              <span className="text-sm">BLM Land</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-forest-600 rounded" />
              <span className="text-sm">Wildlife Refuges</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-forest-600 rounded" />
              <span className="text-sm">State WMAs</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-forest-600 rounded" />
              <span className="text-sm">Game Management Units</span>
            </label>
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Search location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Location
            </label>
            <input
              type="text"
              placeholder="City, state, or coordinates"
              className="input text-sm"
            />
          </div>

          {/* Legend */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Legend</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded" />
                <span>National Forest</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded" />
                <span>BLM</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded" />
                <span>Wildlife Refuge</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-purple-500 rounded" />
                <span>State WMA</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />

        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-forest-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Loading map...</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Note: Add your MapTiler API key to enable the map
              </p>
            </div>
          </div>
        )}

        {/* Map Controls Overlay */}
        <div className="absolute top-4 left-4 space-y-2">
          <button className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg shadow-md flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700">
            <Layers className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-md p-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Click on the map to see location details
          </p>
        </div>
      </div>
    </div>
  )
}
