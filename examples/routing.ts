import { SpiderClient, Location, ViaLocation } from '@tiducto/spider-sdk-typescript'

export async function planTrip(client: SpiderClient) {
  // The recommended shape: a departure time plus a search window, not "N results from now".
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    departAt: new Date(),
    searchWindowMinutes: 60,
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
    searchWindowMinutes: 30,
  })
}

export async function laterItineraries(client: SpiderClient) {
  const firstPage = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
  })

  if (!firstPage.isSuccess) {
    console.error('Planning failed:', firstPage.error)
    return
  }

  const later = await client.routing.planNext(firstPage.data)
  if (later === null) {
    console.log('No later itineraries — that was the last window')
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
    for (const d of result.data) {
      // A Departure carries the scheduled time plus, when a live feed is flowing, the realtime estimate.
      const scheduled = new Date(d.scheduledTimeEpochMs).toISOString()
      const live = d.isRealtime && d.realtimeTimeEpochMs !== null
        ? `${new Date(d.realtimeTimeEpochMs).toISOString()} (${d.realtimeState ?? 'live'})`
        : 'scheduled only'
      const line = d.routeShortName ?? d.routeLongName ?? d.mode ?? '?'
      console.log(`${line} → ${d.headsign ?? '?'} · sched ${scheduled} · ${live} · trip ${d.tripGtfsId ?? '?'}`)
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
    searchWindowMinutes: 60,
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
  })

  if (!firstPage.isSuccess) {
    console.error('Planning failed:', firstPage.error)
    return
  }

  const earlier = await client.routing.planPrevious(firstPage.data)
  if (earlier === null) {
    console.log('No earlier itineraries — that was the first window')
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

export async function planWithOptions(client: SpiderClient) {
  // The key optional request options on `plan`, shown together. All are optional — omit any to take the default.
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    departAt: new Date(),                 // when to leave — or use `arriveBy` to pin the arrival instead
    allowedTransitModes: ['TRAM', 'SUBWAY', 'BUS'], // restrict to these transit modes (empty/undefined = all)
    maxTransfers: 2,                      // hard cap on transfers in any returned itinerary
    searchWindowMinutes: 90,              // widen the window for sparse/intercity routes (default 60)
    wheelchairAccessible: true,           // prefer step-free routing
  })

  if (result.isSuccess) {
    for (const edge of result.data.edges) {
      const it = edge.itinerary
      console.log(`${it.start} → ${it.end}  ·  ${it.numberOfTransfers} transfers  ·  ${it.durationSeconds}s`)
    }
  } else {
    console.error('Planning failed:', result.error.code, result.error.message)
  }
}

export async function planWithErrorHandling(client: SpiderClient) {
  const result = await client.routing.plan({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    departAt: new Date(),
    searchWindowMinutes: 60,
  })

  if (result.isSuccess) {
    console.log(`${result.data.edges.length} itineraries`)
    return
  }

  // No exceptions on failure — branch on `result.error.code`, a `SpiderErrorCode` (one of these nine literals).
  // The `never` in the default makes this switch exhaustive: if a new code is added, this stops compiling.
  switch (result.error.code) {
    case 'unauthorized':
      console.error('Bad or missing apikey — it is scoped to one project + environment')
      break
    case 'bad_request':
      // A server validation failure: over-cap searchWindow, bad via, or a missing required field.
      console.error(`Invalid request on ${result.error.field ?? 'input'}: ${result.error.message}`)
      break
    case 'rate_limited':
      console.error('Too many requests — back off and retry later')
      break
    case 'timeout':
      console.error('The routing engine took too long — try a narrower search')
      break
    case 'not_found':
      console.error('No such stop/trip, or no plan for these inputs')
      break
    case 'network':
      console.error('Could not reach the gateway:', result.error.message)
      break
    case 'server':
      console.error(`Gateway error (HTTP ${result.error.httpStatus ?? '5xx'})`)
      break
    case 'decoding':
      console.error('The response did not match the expected shape:', result.error.message)
      break
    case 'unknown':
      console.error('Unexpected error:', result.error.message)
      break
    default: {
      const unhandled: never = result.error.code
      throw new Error(`Unhandled error code: ${String(unhandled)}`)
    }
  }
}

export async function streamTrip(client: SpiderClient) {
  // Streaming: itineraries (with realtime delays on their legs) arrive as they finalize, rather than one
  // batched page. Never throws — a transport/server error arrives as a `failure` event. `break` out of the
  // loop to stop the sweep and cancel the stream.
  for await (const event of client.routing.planStream({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    departAt: new Date(),
    targetResults: 5,       // soft floor: keep sweeping until at least this many are found
    maxWindowMinutes: 180,  // cap the forward sweep
  })) {
    switch (event.type) {
      case 'result':
        for (const itinerary of event.itineraries) {
          const delay = itinerary.legs[0]?.startDelaySeconds ?? 0
          console.log(`${itinerary.start} → ${itinerary.end}  ·  ${delay >= 0 ? '+' : ''}${delay}s`)
        }
        break
      case 'done':
        // Terminal: continue forward with planStreamNext(options, event.pageInfo.endCursor) when hasNextPage.
        console.log(`done · more available: ${event.pageInfo.hasNextPage}`)
        break
      case 'failure':
        console.error('Stream failed:', event.error.code, event.error.message)
        break
    }
  }
}

export async function streamTripContinue(client: SpiderClient) {
  // Continue a stream forward from the previous sweep's terminal `done` cursor. The same options are passed
  // again (so targetResults / maxWindowMinutes can vary per continuation) plus the raw endCursor.
  const options = {
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    departAt: new Date(),
    targetResults: 5,
    maxWindowMinutes: 180,
  }

  let endCursor: string | null = null
  let hasNextPage = false
  for await (const event of client.routing.planStream(options)) {
    if (event.type === 'done') {
      hasNextPage = event.pageInfo.hasNextPage
      endCursor = event.pageInfo.endCursor
    }
  }

  if (hasNextPage && endCursor !== null) {
    for await (const event of client.routing.planStreamNext(options, endCursor)) {
      if (event.type === 'result') {
        for (const itinerary of event.itineraries) {
          console.log(`${itinerary.start} → ${itinerary.end}`)
        }
      }
    }
  }
}

export async function streamForTime(client: SpiderClient) {
  // Streaming counterpart of planForTime: sweep from a specific departure time, not "now".
  for await (const event of client.routing.planStream({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    departAt: new Date('2026-07-20T08:00:00Z'),
    targetResults: 5,
    maxWindowMinutes: 120,
  })) {
    switch (event.type) {
      case 'result':
        for (const itinerary of event.itineraries) console.log(`${itinerary.start} → ${itinerary.end}`)
        break
      case 'done':
        break
      case 'failure':
        console.error('Stream failed:', event.error.code, event.error.message)
        break
    }
  }
}

export async function streamArriveBy(client: SpiderClient) {
  // Streaming counterpart of arriveBy: sweep by when you need to be there.
  for await (const event of client.routing.planStream({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    arriveBy: new Date('2026-07-20T09:00:00Z'),
    targetResults: 5,
    maxWindowMinutes: 120,
  })) {
    switch (event.type) {
      case 'result':
        for (const itinerary of event.itineraries) console.log(`${itinerary.start} → ${itinerary.end}`)
        break
      case 'done':
        break
      case 'failure':
        console.error('Stream failed:', event.error.code, event.error.message)
        break
    }
  }
}

export async function streamWithModes(client: SpiderClient) {
  // Streaming counterpart of planWithModes: restrict the sweep to tram and subway only.
  for await (const event of client.routing.planStream({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    allowedTransitModes: ['TRAM', 'SUBWAY'],
    targetResults: 5,
    maxWindowMinutes: 120,
  })) {
    switch (event.type) {
      case 'result':
        for (const itinerary of event.itineraries) console.log(`${itinerary.start} → ${itinerary.end}`)
        break
      case 'done':
        break
      case 'failure':
        console.error('Stream failed:', event.error.code, event.error.message)
        break
    }
  }
}

export async function streamVia(client: SpiderClient) {
  // Streaming counterpart of planVia: route through an intermediate stop, waiting at least 2 minutes there.
  for await (const event of client.routing.planStream({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    via: [ViaLocation.visit(Location.stop('U123Z1'), 120)],
    targetResults: 5,
    maxWindowMinutes: 120,
  })) {
    switch (event.type) {
      case 'result':
        for (const itinerary of event.itineraries) console.log(`${itinerary.start} → ${itinerary.end}`)
        break
      case 'done':
        break
      case 'failure':
        console.error('Stream failed:', event.error.code, event.error.message)
        break
    }
  }
}

export async function streamWheelchair(client: SpiderClient) {
  // Streaming counterpart of wheelchairPlan: prefer step-free routing across the sweep.
  for await (const event of client.routing.planStream({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    wheelchairAccessible: true,
    targetResults: 5,
    maxWindowMinutes: 120,
  })) {
    switch (event.type) {
      case 'result':
        for (const itinerary of event.itineraries) console.log(`${itinerary.start} → ${itinerary.end}`)
        break
      case 'done':
        break
      case 'failure':
        console.error('Stream failed:', event.error.code, event.error.message)
        break
    }
  }
}

export async function streamWithLimits(client: SpiderClient) {
  // Streaming counterpart of planWithOptions' transfer cap: at most 2 transfers in any itinerary.
  for await (const event of client.routing.planStream({
    origin: Location.coordinate(49.1951, 16.6068),
    destination: Location.coordinate(49.2246, 16.5747),
    maxTransfers: 2,
    targetResults: 5,
    maxWindowMinutes: 120,
  })) {
    switch (event.type) {
      case 'result':
        for (const itinerary of event.itineraries) console.log(`${itinerary.start} → ${itinerary.end}`)
        break
      case 'done':
        break
      case 'failure':
        console.error('Stream failed:', event.error.code, event.error.message)
        break
    }
  }
}
