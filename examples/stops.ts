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
