import { SpiderClient } from '@tiducto/spider-sdk-typescript'

declare function placeMarker(lat: number, lon: number, label: string): void

export async function reuseHit(client: SpiderClient) {
  const search = await client.stops.search({ name: 'Náměstí' })
  const hit = search.isSuccess ? search.data[0] : undefined

  if (hit && hit.lat !== null && hit.lon !== null) {
    await client.routing.departures(hit.gtfsId, 10)
    placeMarker(hit.lat, hit.lon, hit.name)
  }
}

export async function stopsNearby(client: SpiderClient) {
  // Stops within 500 m of a point in central Brno, nearest first.
  const result = await client.stops.near(49.1951, 16.6068, { radiusMeters: 500, limit: 10 })

  if (result.isSuccess) {
    for (const stop of result.data) {
      console.log(`${stop.name} (${stop.lat}, ${stop.lon})`)
    }
  } else {
    console.error('Nearby search failed:', result.error)
  }
}

export async function stopById(client: SpiderClient) {
  try {
    const stop = await client.stops.byId('U123Z1')
    if (stop == null) {
      console.log('No stop matches that id')
    } else {
      console.log(`${stop.name} (${stop.gtfsId}) — ${stop.city ?? 'unknown city'}`)
    }
  } catch (e) {
    console.error('Stop lookup failed:', e)
  }
}

export async function stopsByCity(client: SpiderClient) {
  // Free-text search constrained to a single admin CITY.
  const result = await client.stops.search({ name: 'Náměstí', city: 'Brno' })

  if (result.isSuccess) {
    for (const stop of result.data) {
      console.log(`${stop.name} — ${stop.suburb ?? stop.city ?? ''}`)
    }
  } else {
    console.error('City search failed:', result.error)
  }
}
