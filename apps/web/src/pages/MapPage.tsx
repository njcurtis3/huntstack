import { Layers, MapPin, Construction } from 'lucide-react'

export function MapPage() {
  return (
    <div className="h-[calc(100vh-4rem)] flex relative">
      {/* Sidebar (visual placeholder) */}
      <div className="w-80 flex flex-col border-r" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))` }}>
        <div className="p-4 border-b" style={{ borderColor: `rgb(var(--color-border-primary))` }}>
          <h2 className="font-semibold text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>Map Layers</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-3">
            {['Public Lands', 'National Forests', 'BLM Land', 'Wildlife Refuges', 'State WMAs', 'Game Management Units'].map((label, i) => (
              <label key={label} className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input type="checkbox" className="w-4 h-4 rounded text-accent-500" disabled defaultChecked={i === 0} />
                <span className="text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>{label}</span>
              </label>
            ))}
          </div>

          <hr style={{ borderColor: `rgb(var(--color-border-primary))` }} />

          <div className="opacity-50">
            <label className="block text-xs font-medium mb-2" style={{ color: `rgb(var(--color-text-secondary))` }}>
              Search Location
            </label>
            <input
              type="text"
              placeholder="City, state, or coordinates"
              className="input text-sm"
              disabled
            />
          </div>

          <div className="opacity-50">
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

      {/* Map Container (visual placeholder) */}
      <div className="flex-1 relative" style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
        {/* Faint grid to suggest a map */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'linear-gradient(rgb(var(--color-border-primary)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--color-border-primary)) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="absolute top-4 left-4 opacity-30">
          <div className="w-10 h-10 rounded-md shadow-sm flex items-center justify-center" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, border: `1px solid rgb(var(--color-border-primary))` }}>
            <Layers className="w-5 h-5" style={{ color: `rgb(var(--color-text-secondary))` }} />
          </div>
        </div>

        <div className="absolute bottom-4 left-4 opacity-30 rounded-md shadow-sm p-2" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, border: `1px solid rgb(var(--color-border-primary))` }}>
          <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
            Click on the map to see location details
          </p>
        </div>
      </div>

      {/* Coming Soon overlay */}
      <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[2px]" style={{ backgroundColor: 'rgba(var(--color-bg-primary), 0.75)' }}>
        <div className="max-w-md w-full mx-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-6 text-center shadow-lg">
            <div className="flex justify-center mb-3">
              <div className="relative">
                <MapPin className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
                <Construction className="w-5 h-5 text-yellow-500 absolute -bottom-1 -right-1" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
              Interactive Map — Coming Soon
            </h2>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
              Public lands, wildlife refuges, and game management unit layers are in development. In the meantime, use <strong>Where to Hunt</strong> for scored refuge recommendations based on live migration data.
            </p>
            <a
              href="/where-to-hunt"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 hover:bg-yellow-300 dark:hover:bg-yellow-700 transition-colors"
            >
              <MapPin className="w-4 h-4" />
              Go to Where to Hunt
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
