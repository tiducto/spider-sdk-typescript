# @tiducto/spider-sdk-client

The TypeScript SDK for the **Spider** transit API — trip planning, stop search, and live realtime data behind one typed contract. It ships the exact query documents the gateway allows and attaches auth for you, so you get a typed, closed surface out of the box.

This is a native TypeScript library with zero runtime dependencies (it uses the platform `fetch`). It is a sibling of the Kotlin SDK and mirrors its domain model and semantics, adapted to TypeScript idioms.

## Install

```bash
npm install @tiducto/spider-sdk-client
```

Requires Node.js 20+ or any modern browser (anything with a global `fetch`).

## Quickstart

Construct a client with your environment's base URL and API key, then call a surface. Every call returns a `SpiderResult<T>` you branch on before reading `data`.

```ts
import { SpiderClient, Location } from '@tiducto/spider-sdk-client';

const client = new SpiderClient('https://brno.api.tiducto.eu', process.env.SPIDER_API_KEY!);

const result = await client.routing.plan({
  origin: Location.coordinate(49.1908, 16.6128),
  destination: Location.coordinate(49.2270, 16.5273),
  first: 3,
});

if (result.isSuccess) {
  for (const edge of result.data.edges) {
    const it = edge.itinerary;
    console.log(`${it.start} → ${it.end} · ${it.numberOfTransfers} transfers`);
  }
} else {
  console.error(result.error.code, result.error.message);
}
```

The API key is sent in an `apikey` header on every request. Keys are scoped to a single project and environment; the environment's routing slug is the subdomain of the base URL.

## Surfaces

All three surfaces are available on the client instance — there is no install step.

### Routing — `client.routing`

```ts
client.routing.plan({ origin, destination, first?, departAt?, arriveBy?, via? }); // → SpiderResult<Route>
client.routing.nextPage(route);                                                   // → SpiderResult<Route> | null
client.routing.previousPage(route);                                               // → SpiderResult<Route> | null
client.routing.departures(stopId, numberOfDepartures?);                           // → SpiderResult<Departure[]>
client.routing.trip(tripId, serviceDate?);                                        // → SpiderResult<TripDetails>
```

An origin or destination is a `Location` — either `Location.coordinate(lat, lon)` or `Location.stop(id)`. By default `plan` searches from now; pass `departAt` (epoch ms or `Date`) for a future departure, or `arriveBy` to plan backwards from an arrival time. Results come back as `edges`, each with an `itinerary` (`start`, `end`, `durationSeconds`, `numberOfTransfers`, `legs`); page through with `nextPage`/`previousPage`.

### Stops — `client.stops`

```ts
client.stops.search({ name?, country?, region?, district?, city?, suburb? }); // → SpiderResult<Stop[]>
```

`name` is a fuzzy, typo-tolerant free-text match; the admin-area fields are exact filters that scale server-side. A `Stop` carries `gtfsId`, `name`, `lat`/`lon`, and the admin-geography fields. Feed a `gtfsId` straight into routing or realtime — ids are opaque and never re-prefixed.

### Realtime — `client.realtime`

```ts
client.realtime.vehicles(tripIds);       // → SpiderResult<VehiclePositions>
client.realtime.vehicleForTrip(tripId);  // → SpiderResult<LiveVehicleUpdate>
client.realtime.delays(tripIds);         // → SpiderResult<TripDelays>
client.realtime.alerts();                // → SpiderResult<ServiceAlerts>
```

Realtime is poll-based — call on an interval (10–15s is a sensible default); there are no push connections. Every snapshot carries `freshness` so the UI can tell how current the data is. `vehicleForTrip` returns a `LiveVehicleUpdate` whose `vehicle` is `null` when nothing is reporting for that trip — a normal state, not an error.

## Handling results

`SpiderResult<T>` is a discriminated union on `isSuccess`:

```ts
const result = await client.realtime.delays(tripIds);
if (result.isSuccess) {
  for (const delay of result.data.delays) {
    console.log(delay.tripId, delay.delaySeconds);
  }
} else {
  // result.error: { code, message, httpStatus?, cause? }
  console.error(result.error.code);
}
```

`error.code` is one of `network`, `timeout`, `unauthorized`, `not_found`, `server`, `rate_limited`, `decoding`, `unknown`.

## Timeouts and custom fetch

```ts
new SpiderClient(baseUrl, apiKey, { timeoutMs: 10_000, fetch: myFetch });
```

`timeoutMs` (default 30s) aborts a request that takes too long, surfacing as a `timeout` error. `fetch` injects a custom implementation (useful for tests or non-standard runtimes).

## Contract version

The SDK sends its wire-contract version on every request. If the gateway ever declares an incompatible major version, the call throws `SpiderContractMismatchError` — a hard failure that bypasses `SpiderResult`, signalling the SDK build is incompatible with the deployment rather than a recoverable runtime error.

## Development

```bash
npm run build      # emit dist/ (ESM + .d.ts) via tsc
npm run typecheck  # type-check src + tests
npm test           # run the test suite (node --test, mocked fetch)
```

## License

MIT
