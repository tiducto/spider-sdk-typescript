import { SpiderClient, Location } from '@tiducto/spider-sdk-typescript'

export async function planTrip(client: SpiderClient) {
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    first: 3,
  })

  if (result.isSuccess) {
    for (const edge of result.data.edges) {
      const itinerary = edge.itinerary
      console.log(`${itinerary.start} → ${itinerary.end}  ·  ${itinerary.numberOfTransfers} transfers`)
      for (const leg of itinerary.legs) {
        console.log(`  ${leg.mode} ${leg.routeShortName ?? 'walk'}: ${leg.fromName} → ${leg.toName} (${leg.durationSeconds}s)`)
      }
    }
  } else {
    console.error('Planning failed:', result.error)
  }
}

export async function planForTime(client: SpiderClient) {
  await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    departAt: new Date('2026-07-20T08:00:00Z'),
  })
}

export async function laterItineraries(client: SpiderClient) {
  const firstPage = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    first: 3,
  })

  if (!firstPage.isSuccess) {
    console.error('Planning failed:', firstPage.error)
    return
  }

  const later = await client.routing.nextPage(firstPage.data, 3)
  if (later === null) {
    console.log('No later itineraries — that was the last page')
  } else if (later.isSuccess) {
    for (const edge of later.data.edges) {
      console.log(`${edge.itinerary.start} → ${edge.itinerary.end}`)
    }
  } else {
    console.error('Paging failed:', later.error)
  }
}

export async function departures(client: SpiderClient) {
  const result = await client.routing.departures('U123Z1', 5)

  if (result.isSuccess) {
    for (const departure of result.data) {
      const time = new Date(departure.scheduledTimeEpochMs).toISOString()
      console.log(`${departure.routeShortName} → ${departure.headsign} at ${time}`)
    }
  } else {
    console.error(result.error)
  }
}

export async function tripLookup(client: SpiderClient) {
  const result = await client.routing.trip('1:12345')

  if (result.isSuccess) {
    for (const stop of result.data.stops) {
      console.log(`${stop.name}: arr ${stop.scheduledArrivalEpochMs}, dep ${stop.scheduledDepartureEpochMs}`)
    }
  } else {
    console.error(result.error)
  }
}
