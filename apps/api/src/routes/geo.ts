import { FastifyPluginAsync } from 'fastify'

// Nominatim (OpenStreetMap) — free, no key, excellent US zip code support
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'HuntStack/1.0 (huntstack.app)'

export const geoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/zip/:zip', async (request, reply) => {
    const { zip } = request.params as { zip: string }
    if (!/^\d{5}$/.test(zip)) {
      return reply.status(400).send({ error: 'Invalid zip code' })
    }

    const url = new URL(NOMINATIM_BASE)
    url.searchParams.set('postalcode', zip)
    url.searchParams.set('country', 'US')
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('addressdetails', '1')

    let res: Response
    try {
      res = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT },
      })
    } catch {
      return reply.status(502).send({ error: 'Geocoding service unavailable' })
    }

    if (!res.ok) {
      return reply.status(502).send({ error: 'Geocoding service unavailable' })
    }

    const data = await res.json() as any[]
    const match = data?.[0]
    if (!match) {
      return reply.status(404).send({ error: 'Zip code not found' })
    }

    // Nominatim returns county/suburb as city-level; prefer city > town > county
    const addr = match.address ?? {}
    const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? ''
    const state = addr.state_code?.toUpperCase() ?? addr.state ?? ''

    return {
      lat: parseFloat(match.lat) as number,
      lng: parseFloat(match.lon) as number,
      city,
      state,
    }
  })
}
