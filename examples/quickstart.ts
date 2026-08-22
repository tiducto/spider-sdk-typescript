import { SpiderClient, Location } from '@tiducto/spider-sdk-typescript'

export async function handleResult(client: SpiderClient) {
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1908, 16.6128),
    destination: Location.coordinate(49.2270, 16.5273),
    first: 3,
  })

  if (result.isSuccess) {
    for (const edge of result.data.edges) {
      console.log(edge.itinerary)
    }
  } else {
    console.error('Plan failed:', result.error)
  }
}

export async function otherSurfaces(client: SpiderClient, tripId: string) {
  await client.stops.search({ name: 'central' })
  await client.realtime.vehicleForTrip(tripId)
}
