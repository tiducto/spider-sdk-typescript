import { SpiderClient, Location, ViaLocation } from '@tiducto/spider-sdk-typescript'

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

  const later = await client.routing.planNext(firstPage.data, 3)
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

export async function planWithModes(client: SpiderClient) {
  // Restrict routing to a set of transit modes — here tram and subway only.
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    allowedTransitModes: ['TRAM', 'SUBWAY'],
    first: 3,
  })

  if (result.isSuccess) {
    for (const edge of result.data.edges) {
      const modes = edge.itinerary.legs.map((leg) => leg.mode ?? 'WALK').join(' → ')
      console.log(`${edge.itinerary.start} → ${edge.itinerary.end}  ·  ${modes}`)
    }
  } else {
    console.error('Planning failed:', result.error)
  }
}

export async function arriveBy(client: SpiderClient) {
  // Plan by when you need to be there, not when you leave.
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    arriveBy: new Date('2026-07-20T09:00:00Z'),
    first: 3,
  })

  if (result.isSuccess) {
    for (const edge of result.data.edges) {
      console.log(`depart ${edge.itinerary.start} → arrive ${edge.itinerary.end}`)
    }
  } else {
    console.error('Planning failed:', result.error)
  }
}

export async function earlierItineraries(client: SpiderClient) {
  const firstPage = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    first: 3,
  })

  if (!firstPage.isSuccess) {
    console.error('Planning failed:', firstPage.error)
    return
  }

  const earlier = await client.routing.planPrevious(firstPage.data, 3)
  if (earlier === null) {
    console.log('No earlier itineraries — that was the first page')
  } else if (earlier.isSuccess) {
    for (const edge of earlier.data.edges) {
      console.log(`${edge.itinerary.start} → ${edge.itinerary.end}`)
    }
  } else {
    console.error('Paging failed:', earlier.error)
  }
}

export async function planVia(client: SpiderClient) {
  // Route through an intermediate stop, waiting at least 2 minutes there.
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    via: [ViaLocation.visit(Location.stop('U123Z1'), 120)],
    first: 3,
  })

  if (result.isSuccess) {
    for (const edge of result.data.edges) {
      console.log(`${edge.itinerary.start} → ${edge.itinerary.end}  ·  ${edge.itinerary.numberOfTransfers} transfers`)
    }
  } else {
    console.error('Planning failed:', result.error)
  }
}

export async function wheelchairPlan(client: SpiderClient) {
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    wheelchairAccessible: true,
    first: 3,
  })

  if (result.isSuccess) {
    for (const edge of result.data.edges) {
      const itinerary = edge.itinerary
      console.log(`${itinerary.start} → ${itinerary.end}  ·  accessibility score ${itinerary.accessibilityScore ?? 'n/a'}`)
      for (const leg of itinerary.legs) {
        console.log(`  ${leg.mode ?? 'walk'}: board ${leg.fromWheelchair ?? 'unknown'} → alight ${leg.toWheelchair ?? 'unknown'}`)
      }
    }
  } else {
    console.error('Planning failed:', result.error)
  }
}
