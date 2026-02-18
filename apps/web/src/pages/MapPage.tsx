import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Layers } from 'lucide-react'

export function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://api.maptiler.com/maps/outdoor-v2/style.json?key=get_your_own_key',
      center: [-98.5795, 39.8283],
      zoom: 4,
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.current.on('load', () => {
      setMapLoaded(true)
    })

    return () => {
      map.current?.remove()
    }
  }, [])

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Sidebar */}
      <div className="w-80 flex flex-col border-r" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))` }}>
        <div className="p-4 border-b" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
          <h2 className="font-semibold text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>Map Layers</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-3">
            {['Public Lands', 'National Forests', 'BLM Land', 'Wildlife Refuges', 'State WMAs', 'Game Management Units'].map((label, i) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-accent-500 focus:ring-accent-500" defaultChecked={i === 0} />
                <span className="text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>{label}</span>
              </label>
            ))}
          </div>

          <hr style={{ borderColor: `rgb(var(--color-border-primary))` }} />

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: `rgb(var(--color-text-secondary))` }}>
              Search Location
            </label>
            <input
              type="text"
              placeholder="City, state, or coordinates"
              className="input text-sm"
            />
          </div>

          <div>
            <h3 className="text-xs font-medium mb-2" style={{ color: `rgb(var(--color-text-secondary))` }}>Legend</h3>
            <div className="space-y-2 text-sm">
              {[
                { color: 'bg-forest-500', label: 'National Forest' },
                { color: 'bg-yellow-500', label: 'BLM' },
                { color: 'bg-accent-500', label: 'Wildlife Refuge' },
                { color: 'bg-purple-500', label: 'State WMA' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-3 h-3 ${color} rounded`} />
                  <span style={{ color: `rgb(var(--color-text-secondary))` }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />

        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p style={{ color: `rgb(var(--color-text-secondary))` }}>Loading map...</p>
              <p className="text-xs mt-2" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                Note: Add your MapTiler API key to enable the map
              </p>
            </div>
          </div>
        )}

        <div className="absolute top-4 left-4 space-y-2">
          <button className="w-10 h-10 rounded-md shadow-sm flex items-center justify-center hover:opacity-90 transition-opacity" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, border: `1px solid rgb(var(--color-border-primary))` }}>
            <Layers className="w-5 h-5" style={{ color: `rgb(var(--color-text-secondary))` }} />
          </button>
        </div>

        <div className="absolute bottom-4 left-4 rounded-md shadow-sm p-2" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, border: `1px solid rgb(var(--color-border-primary))` }}>
          <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
            Click on the map to see location details
          </p>
        </div>
      </div>
    </div>
  )
}
