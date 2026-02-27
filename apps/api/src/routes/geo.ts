import { FastifyPluginAsync } from 'fastify'

// Nominatim (OpenStreetMap) — free, no key, excellent US coverage
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'HuntStack/1.0 (huntstack.app)'

function parseNominatimAddress(match: Record<string, unknown>): { lat: number; lng: number; city: string; state: string } {
  const addr = (match.address ?? {}) as Record<string, string>
  const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? ''
  const state = addr.state_code?.toUpperCase() ?? addr.state ?? ''
  return {
    lat: parseFloat(match.lat as string),
    lng: parseFloat((match.lon ?? match.lng) as string),
    city,
    state,
  }
}

export const geoRoutes: FastifyPluginAsync = async (app) => {
  // Zip code lookup
  app.get('/zip/:zip', async (request, reply) => {
    const { zip } = request.params as { zip: string }
    if (!/^\d{5}$/.test(zip)) {
      return reply.status(400).send({ error: 'Invalid zip code' })
    }

    const url = new URL(NOMINATIM_SEARCH)
    url.searchParams.set('postalcode', zip)
    url.searchParams.set('country', 'US')
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('addressdetails', '1')

    let res: Response
    try {
      res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT } })
    } catch {
      return reply.status(502).send({ error: 'Geocoding service unavailable' })
    }

    if (!res.ok) return reply.status(502).send({ error: 'Geocoding service unavailable' })

    const data = await res.json() as Record<string, unknown>[]
    const match = data?.[0]
    if (!match) return reply.status(404).send({ error: 'Zip code not found' })

    return parseNominatimAddress(match)
  })

  // Free-text city/place search: GET /search?q=Stuttgart+AR
  app.get('/search', async (request, reply) => {
    const { q } = request.query as { q?: string }
    if (!q?.trim()) {
      return reply.status(400).send({ error: 'q parameter required' })
    }

    const url = new URL(NOMINATIM_SEARCH)
    url.searchParams.set('q', q.trim())
    url.searchParams.set('countrycodes', 'us')
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('addressdetails', '1')

    let res: Response
    try {
      res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT } })
    } catch {
      return reply.status(502).send({ error: 'Geocoding service unavailable' })
    }

    if (!res.ok) return reply.status(502).send({ error: 'Geocoding service unavailable' })

    const data = await res.json() as Record<string, unknown>[]
    const match = data?.[0]
    if (!match) return reply.status(404).send({ error: 'Location not found' })

    return parseNominatimAddress(match)
  })

  // Reverse geocode: GET /reverse?lat=34.5&lng=-92.1
  app.get('/reverse', async (request, reply) => {
    const { lat, lng } = request.query as { lat?: string; lng?: string }
    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
      return reply.status(400).send({ error: 'lat and lng required' })
    }

    const url = new URL(NOMINATIM_REVERSE)
    url.searchParams.set('lat', lat)
    url.searchParams.set('lon', lng)
    url.searchParams.set('format', 'json')
    url.searchParams.set('addressdetails', '1')

    let res: Response
    try {
      res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT } })
    } catch {
      return reply.status(502).send({ error: 'Geocoding service unavailable' })
    }

    if (!res.ok) return reply.status(502).send({ error: 'Geocoding service unavailable' })

    const match = await res.json() as Record<string, unknown>
    if (!match || match.error) return reply.status(404).send({ error: 'Location not found' })

    return { ...parseNominatimAddress(match), lat: parseFloat(lat), lng: parseFloat(lng) }
  })
}
