import { SpiderClient } from '@tiducto/spider-sdk-typescript'

export async function searchPlaces(client: SpiderClient) {
  // Places matching the text, nearest of equally good matches first; each hit carries its distance in metres.
  const result = await client.places.search('Údolní 53', { near: { lat: 49.1951, lng: 16.6068 }, limit: 5 })

  if (result.isSuccess) {
    for (const hit of result.data) {
      console.log(`${hit.type} ${hit.name} — ${hit.city ?? ''} (${hit.distance ?? '?'} m)`)
    }
  } else {
    console.error('Place search failed:', result.error)
  }
}
