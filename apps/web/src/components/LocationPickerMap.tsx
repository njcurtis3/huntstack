import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

interface LocationPickerMapProps {
  value: { lat: number; lng: number } | null
  onChange: (point: { lat: number; lng: number }) => void
}

const STYLE_URL = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${import.meta.env.VITE_MAPTILER_KEY ?? ''}`

// Lower 48 view until the hunter picks or locates themselves.
const DEFAULT_CENTER: [number, number] = [-98, 39]

export default function LocationPickerMap({ value, onChange }: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  // Latest callback and starting point, read by the one-time map setup below.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialValue = useRef(value)

  useEffect(() => {
    if (!containerRef.current) return
    const start = initialValue.current
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: start ? [start.lng, start.lat] : DEFAULT_CENTER,
      zoom: start ? 9 : 3,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.getCanvas().style.cursor = 'crosshair'
    map.on('click', (e) => {
      const { lat, lng } = e.lngLat.wrap()
      onChangeRef.current({ lat, lng })
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Keep the pin and view in step with the chosen point (a tap, or "Use my location").
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!value) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: '#dc2626' }).setLngLat([value.lng, value.lat]).addTo(map)
    } else {
      markerRef.current.setLngLat([value.lng, value.lat])
    }
    if (!map.getBounds().contains([value.lng, value.lat])) {
      map.easeTo({ center: [value.lng, value.lat], zoom: Math.max(map.getZoom(), 9) })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className="w-full h-64 md:h-72 rounded-md overflow-hidden border"
      style={{ borderColor: 'rgb(var(--color-border-primary))' }}
    />
  )
}
