# Changelog

## Unreleased

Targets Spider API contract 1.12.

### Added

- **`RoutePreferences.modeReluctance`** (`Partial<Record<TransitMode, number>>`), on every `plan` and `planStream`
  call and kept with the route so `planNext` / `planPrevious` resend it: how much worse riding a mode is, a
  multiplier from 0.1 to 100000 per mode, with a mode not listed at 1. It restricts no mode, and a mode
  `excludedTransitModes` names stays excluded. Without `allowedTransitModes` it is sent as `modes.transit.costs`
  (beside `exclude`), in the `TransitMode` declaration order; with `allowedTransitModes` each allowed mode carries its
  reluctance as `modes.transit.transit[].cost.reluctance`, a reluctance for a mode not allowed is dropped, and
  `costs` is never sent. Undefined or `{}` sends nothing, and WALK / UNKNOWN drop out. A reluctance outside 0.1 to
  100000 or not finite fails as `bad_request` on `modes.transit.costs.reluctance` (or
  `modes.transit.transit.cost.reluctance` with an allowed list) without a request.
- **`ParentStation`** (`gtfsId`, `name`): the station a stop belongs to, whose `gtfsId` plans and departures accept
  for the whole station.
  - **`Leg.fromParentStation`** and **`Leg.toParentStation`** (`plan` and `planStream`): null when the leg's stop
    has no station, or the leg end is a coordinate.
  - **`TripStop.parentStation`**: null when the stop has no station.
- **`stopDepartures(stopId, numberOfDepartures?, options?)`**: the same request as `departures`, returning a
  **`StopDepartures`** with the stop's `gtfsId`, `name`, `wheelchairBoarding` (null for a station), `parentStation`
  (null for a station and for a stop without one) and its `departures`. `departures` keeps its signature and
  behaviour, an id that resolves to no stop or station included.

- **`RoutePreferences`** and **`preferences`** on `PlanOptions` and `PlanStreamRequestOptions` (`plan`,
  `planStream`, `planStreamNext`, `planStreamPrevious`), kept with the route so `planNext` / `planPrevious` resend
  it: the contract's routing preferences the SDK didn't expose. `walkSpeed`, `walkReluctance` and `boardCost` are
  sent under `preferences.street.walk`, `transferCost` and `transferSlackSeconds` under
  `preferences.transit.transfer` (beside `maximumTransfers` from `maxTransfers`), `waitReluctance` and
  `boardSlackSeconds` under `preferences.transit.board`, `alightSlackSeconds` under `preferences.transit.alight`, and
  `excludedRoutes` / `excludedAgencies` (feed-prefixed ids) as one `preferences.transit.filters` exclusion. Slacks
  are seconds, sent as ISO-8601 (`PT90S`). Each member left undefined keeps the environment's default, and
  undefined or empty exclusions exclude nothing, so `{}` sends the same body as no preferences. A value outside the
  contract's fixed range (a walking speed under 0.1 or not finite, a multiplier outside 0.1 to 100000, a cost that
  isn't an integer from 0 to 1000000, a slack outside 0 to 3600 seconds) fails as `bad_request` on its contract path,
  such as `preferences.transit.board.slack`, without a request: `plan` returns the failure and a stream yields it as
  its one `failure` event.
- **`transitOnly`** on `PlanOptions` and `PlanStreamRequestOptions`, kept with the route so `planNext` /
  `planPrevious` resend it: true leaves out every itinerary without a transit leg, such as walking the whole way.
  Sent as `modes.transitOnly` only when true, beside `allowedTransitModes` or `excludedTransitModes`. The contract's
  `directOnly` stays unexposed.
- **`PlanOptions.numberOfItineraries`**: the most itineraries a `plan` page holds, from 1 up to the environment's
  itinerary limit, rejected and never clamped by the API; undefined means the limit. Kept with the route, and
  `planNext(route, numberOfItineraries?)` / `planPrevious(route, numberOfItineraries?)` take it too: undefined keeps
  the size the route was asked with, null asks for the limit, and the pages after keep what that page used. Sent as
  `first` on the first page and after a cursor, as `last` before one. `planStream` sizes itself by `targetResults`
  and doesn't take it.

## 1.11.0

Targets Spider API contract 1.11.

### Added

- **`TripVehicle`**: the vehicle running a trip run, as the realtime trip update names it, with its `id`
  (feed-prefixed, the same string as `LiveVehicle.vehicleId`), `label`, `wheelchairAccessible` (`POSSIBLE` or
  `NOT_POSSIBLE`, the vehicle's realtime access rather than the timetable's), `airConditioning`, `wifi` and
  `cardPayment`, each null when unknown. One type on every place a trip run is read, so a board or an itinerary
  shows the vehicle's features without a realtime call:
  - **`TripUpdate.vehicle`**: null when the update names no vehicle.
  - **`Leg.vehicle`** (`plan` and `planStream`): null on a walk leg and until a vehicle is matched to the run.
  - **`Departure.vehicle`** and **`TripDetails.vehicle`**: null until a vehicle is matched to the run.

## 1.10.0 — 2026-11-24

Targets Spider API contract 1.10.

### Added

- **`DeparturesOptions.excludedModes`**: the board leaves out every departure of those modes. The API drops them
  before it counts `numberOfDepartures`, so the board, and each later one paged by `startTime`, still holds up to
  `numberOfDepartures` departures of the other modes. Sent as `excludeModes`; undefined or empty excludes nothing.
- **`excludedTransitModes`** on `PlanOptions` and `PlanStreamRequestOptions` (`plan`, `planStream`, `planStreamNext`,
  `planStreamPrevious`), kept with the route so `planNext` / `planPrevious` resend it: the modes routing must not
  ride, with every other mode usable, including one the API adds later. Sent as `modes.transit.exclude`; undefined or
  empty excludes nothing, and `WALK` / `UNKNOWN` drop out, as in `allowedTransitModes`. Together with a non-empty
  `allowedTransitModes` it fails as `bad_request` on `modes.transit` (`modes.transit is invalid`) without a request:
  `plan` returns the failure and a stream yields it as its one `failure` event.
- **`realtime.tripUpdates(serviceDate, tripIds)`**: live trip updates for up to 50 trips on one service date, from
  `/realtime/v1/trip-updates`. Each `TripUpdate` carries the trip run's `delaySeconds`, `scheduleRelationship` and
  `stopTimeUpdates`, as a delay did, plus its `startTime`: a frequency-based trip gives one update per run. Takes the
  same arguments and validation as `delays`. `tripUpdateFor(updates, tripId, startTime?)` looks one up, and
  `pollTripUpdates` polls it.
- **`TripUpdate.modifications`** (experimental, as GTFS-RT trip modifications, and may change in a minor release):
  the detours applying to the run, each a `TripModification` with the replaced span (`startStop` / `endStop`, a
  `StopSelector` by stop sequence and/or stop id), the `replacementStops` visited instead (with the travel time to
  each, and a name and position for a stop the feed defines in realtime), `propagatedModificationDelaySeconds`, the
  `alertId` describing it, `lastModifiedEpochMs` and the detour `shape` as points.
- **`LiveVehicle.startTime`**: the start time of the run the vehicle is on (GTFS `HH:MM:SS`, may exceed `24:00:00`),
  telling apart the runs of a frequency-based trip; null when the feed gives none.
- **`LiveVehicle.wheelchairAccessible`**: `POSSIBLE` or `NOT_POSSIBLE` for the vehicle reported on the trip; null
  when the feed reports no value or GTFS-RT `UNKNOWN`.
- **`LiveVehicle.airConditioning`, `wifi` and `cardPayment`**: whether the vehicle is air-conditioned, offers Wi-Fi
  and accepts card payment on board; null when unknown.
- **`startTime`** on `realtime.vehicleForTrip` and `pollVehicleForTrip` (`VehicleForTripPollOptions`),
  `routing.trip` and `routing.estimatedDelays`: picks the run of a frequency-based trip by its start time, a GTFS time
  `H:MM:SS` or `HH:MM:SS` (`8:10:00` is `08:10:00`). Undefined or empty takes the trip's first run (for a vehicle, the
  run with the earliest start time). A time no run starts at is an unknown trip: `trip` fails as `not_found` and
  `estimatedDelays` is null. A malformed time fails as `bad_request` on `startTime` without a request.

### Deprecated

- **`realtime.delays`, `delayFor` and `pollDelays`**: the API deprecated `/realtime/v1/delays` (retired not before
  2027-05-24). Use `tripUpdates`, `tripUpdateFor` and `pollTripUpdates`; `delays` keeps working until then and
  answers a frequency-based trip's earliest run only.

## 1.9.0

Targets Spider API contract 1.9.

### Added

- **`PickupDropoffType`**: whether and how a rider boards or alights at a stop: `SCHEDULED` regularly, `NONE` not at
  all, `CALL_AGENCY` only after phoning the agency, `COORDINATE_WITH_DRIVER` only by arranging it with the driver. An
  app shows a `COORDINATE_WITH_DRIVER` stop as "on request": the rider signals the driver to get off, or waves the
  vehicle down to get on.
- **`Leg.pickupType` and `Leg.dropoffType`**: how the rider boards at the leg's first stop and alights at its last;
  never null. `SCHEDULED` on a walk leg and where the rider stays on board across an interlined pair.
- **`Departure.pickupType` and `Departure.dropoffType`**: never null. A departure board leaves out departures nobody can
  board, so `pickupType` is never `NONE`.
- **`TripStop.pickupType` and `TripStop.dropoffType`**: null when the stop is canceled, because the trip is canceled
  or realtime skips the stop.

## 1.8.0

Targets Spider API contract 1.8.

### Added

- **`PlaceHit.stop`**: a `STOP` hit carries its stop as a `Stop` (`gtfsId`, `name`, `code`, `wheelchairBoarding`,
  `modes`, `lat`/`lon` and the admin labels), mapped exactly as stop search maps a hit; null for any other type.

### Removed

- **`Stop.locationType`**: contract 1.8 dropped `locationType` from stop search before launch. A station's platforms
  stay folded into it.

## 1.7.1

### Removed

- **`PlaceType` `'STREET'`**: place search no longer returns streets, and a `street` type decodes as `UNKNOWN`. A
  query without a house number lists stops, municipalities (`PLACE`) and points of interest; one with a house number
  (any digit) lists individual addresses.

## 1.7.0 — 2026-11-11

Targets Spider API contract 1.7.

### Added

- **`client.places` (`SpiderPlaces`)**: `search(query, { near?, limit? })` searches stops, addresses, municipalities
  and points of interest in one query, best first, returning `PlaceHit[]`. `limit` defaults to 10 and is 1 to 20; one
  outside that range fails as `bad_request` without a request. With `near`, the nearest of equally good matches ranks
  first and each hit carries `distance` in metres. A query with a house number lists individual addresses. A `STOP`
  hit's `id` is the stop id routing takes.
- **`PlaceHit`** (`id`, `type`, `name`, `lat`, `lon`, `category`, the admin labels `country` … `suburb` as on a `Stop`,
  `distance`) and **`PlaceType`** (`STOP`, `ADDRESS`, `PLACE` for a municipality, `POI`, and `UNKNOWN` for a type this
  SDK version doesn't know).
- **`SpiderClientOptions.places`**: per-feature options for place search, as for `routing`, `stops` and `realtime`.

## 1.6.0 — 2026-11-02

Targets Spider API contract 1.6.

### Added

- **`routing.estimatedDelays(tripId, serviceDate, stopPosition)`**: one stop's delay history for a trip run as
  `EstimatedDelays` (`standardSeconds`, `safeSeconds`, `verySafeSeconds`), or null when the trip, the stop position
  or the history is unknown. History only: live realtime never changes it.
- **`reliability` on `departures` (`DeparturesOptions.reliability`) and `trip`**: the level `typicalDelaySeconds` is
  given at.
- **`LiveVehicle.serviceDate`**: the service date of the trip run the vehicle is on.

### Changed (breaking)

- **`typicalDelaySeconds` on `Departure` and `TripStop` is null unless `reliability` is passed**; it was the median.
- **`trip(tripId, serviceDate, reliability?)` requires `serviceDate`**, a `Leg.serviceDate` or `Departure.serviceDate`;
  there is no "today" default. `TripDetails.serviceDate` is non-null: the requested date.
- **`vehicles(serviceDate, tripIds)` and `vehicleForTrip(tripId, serviceDate)` require `serviceDate`**, as do
  `pollVehicles(realtime, serviceDate, tripIds)` and `pollVehicleForTrip(realtime, tripId, serviceDate)`: a vehicle is
  returned only while it runs that trip run. A malformed date fails as `bad_request` without a request.

## 1.5.0 — 2026-10-26

Targets Spider API contract 1.5.

### Added

- **`RoutingErrorCode` `OUTSIDE_BOUNDS`, `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW` and `NO_DIRECT_MODE_CONNECTION`**,
  which earlier versions decode as `UNKNOWN`. A coordinate origin or destination outside the area the router covers
  is `OUTSIDE_BOUNDS` on `FROM` or `TO`, and one with no street near enough to link to is `LOCATION_NOT_FOUND`. A
  search that ran and kept no transit itinerary in the window now says why in `Route.routingErrors` and the stream's
  `done` event: `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW` on `DATE_TIME`, or `WALKING_BETTER_THAN_TRANSIT` when
  walking beat every transit itinerary found. A direct-only plan that finds no walk is `NO_DIRECT_MODE_CONNECTION`.

### Changed

- **`via` may mix `ViaLocation.visit` and `ViaLocation.passThrough`**, in the order given; the router used to answer
  a mix as `bad_request` on `via`.
- **`wheelchairAccessible`** plans for a wheelchair user: only trips the feed marks wheelchair accessible, boarding
  and alighting only at stops it marks accessible (no information counts as not accessible), walking strongly
  avoiding steps and ways mapped as not wheelchair accessible.
- **`Leg.realtimeState`** is `SCHEDULED` on a walk leg.

## 1.4.1

### Changed

- **`Leg.geometry` and `TripDetails.geometry` decode at precision 1e6**, the precision the router encodes them at:
  points land within about 0.1 m instead of 1 m, so a stop's point on the line (`geometryIndex`) is where the
  router cut it. Earlier SDK versions misplace the lines of such a router.

## 1.4.0 — 2026-10-22

Targets Spider API contract 1.4.

### Added

- **`TripStop.stopPosition`, `Departure.stopPosition`, `Leg.fromStopPosition` and `Leg.toStopPosition`**: a stop's
  position in its trip. A departure, or a leg's boarding and alighting stop, finds its `TripStop` by an equal
  `stopPosition`, also on a trip that visits one stop twice.
- **`TripStop.geometryIndex`**: the index into `TripDetails.geometry` of where the stop sits on the trip's line;
  null when the trip has no geometry or the stop has no point on it.

## 1.3.1 — 2026-10-07

### Added

- **`delayFor(delays, tripId)`** returns the trip's `TripDelay` from a `TripDelays`, or null if the feed did not
  report it, as in the Kotlin, Dart and Swift SDKs. 1.3.0 listed it as removed; it is not.

## 1.3.0 — 2026-10-07

Targets Spider API contract 1.3, a conformance release. SDKs up to 1.2 do not work against contract 1.3: realtime
delays moved to `GET`.

### Breaking

- **`realtime.delays(serviceDate, tripIds)`** takes one service date and calls `GET /realtime/v1/delays`. The
  grouped `delays(byServiceDate)` and `delays(tripIds, serviceDate)` forms are gone; call once per date.
  `pollDelays(realtime, serviceDate, tripIds, options?)` follows.
- **`TripDelays` is flat:** `{ serviceDate, delays, missing, freshness }`. `ServiceDateDelays` and `delayFor`
  are removed.
- **`delays` checks its ids before any request.** Duplicates are dropped and the rest sorted, so equal requests
  share one URL and cache entry. No ids is `tripIds is required` (was a skipped call), a blank id
  `tripIds is invalid`, more than 50 distinct ids `tripIds is out of range`.
- **Realtime ids are feed-prefixed** (`<feedId>:<id>`), exactly as routing returns them, and sent untouched.
- **`'query_retired'` is removed** from `SpiderErrorCode`; a 410 is `unknown`.
- **`RoutingErrorCode` drops `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW` and `OUTSIDE_BOUNDS`.**
- **Types follow the contract's exact nullability.** Now non-null: `Itinerary.start`, `end`,
  `waitingTimeSeconds`; `Leg.mode`, `realtimeState`, `fromName`, `toName`, `distanceMeters`, `durationSeconds`;
  `Route.searchDateTime`; `Departure.realtimeTimeEpochMs`, `realtimeState`, `tripGtfsId`, `routeGtfsId`, `mode`,
  `stopGtfsId`; `TripStop.lat`, `lon` and its four time fields; `TripDetails.routeGtfsId`, `mode`; `Stop.lat`,
  `lon`; `LiveVehicle.tripId`, `latitude`, `longitude`; `TripDelay.tripId`; `ServiceAlert.id`.
- Leg and itinerary durations are whole seconds. `Itinerary.durationSeconds` no longer falls back to 0.

## 1.2.0 — 2026-10-06

Targets Spider API contract 1.2. Routing moves from persisted GraphQL queries to plain REST operations, and every
routing, stops and realtime path moves under `/v1`; the public API stays as it was apart from the changes below.
SDKs up to 1.1 do not work against contract 1.2, so every surface needs this release.

### Changed

- **Routing calls are REST.** `plan`, `planNext` and `planPrevious` POST a JSON body to `/routing/v1/plan`,
  `departures` to `/routing/v1/departures` and `trip` to `/routing/v1/trip`; `planStream`, `planStreamNext` and
  `planStreamPrevious` POST to `/routing/v1/plan-stream` and read its event stream. The SDK sends no
  persisted-query ids.
- **Stops and realtime calls use the `/v1` paths:** `/stops/v1/search`, `/realtime/v1/vehicles`,
  `/realtime/v1/vehicles/by-trip/{id}`, `/realtime/v1/delays` and `/realtime/v1/alerts`. Requests and responses
  are unchanged.
- **`'query_retired'` (HTTP 410) carries the server's message**, or `this API part is retired` when it sends
  none.
- **A visit to a coordinate is rejected before any request**, as `bad_request` on `via` (`via is invalid`), the
  answer the server already gave. `ViaLocation.visit` takes a stop.
- **A visit waits at most 3600 seconds** (was 86400). A longer or negative wait is rejected before any request,
  as `bad_request` on `via.visit.minimumWaitTime`.
- **A server `bad_request` names its field as a dot path** from the request body root (e.g.
  `preferences.transit.transfer.maximumTransfers`): the response's `field`, else the one its
  `<field> is required|invalid|out of range|not allowed` message names.
- **A plan stream ends with its `done` event, or with a `network` failure when it ends before its `pageInfo`**
  (the connection dropped). Events this SDK does not know are ignored, `error` included; a malformed event ends
  the stream with a `decoding` failure.
- **A plan-limit refusal's code is the response body's `code`, else its `error`.**
- `serverCode` `persisted_query_rejected` is no longer sent: the SDK sends no persisted queries.

### Deprecated

- `RouteEdge.cursor`: always `'NoCursor'`; page with `Route.pageInfo`.
- `Itinerary.accessibilityScore` and `Leg.accessibilityScore`: always `null`.

## 1.1.0 — 2026-10-05

Targets Spider API contract 1.1. Additive: existing calls behave as in 1.0.0.

### Added

- **`reliability` on `PlanOptions` and `PlanStreamRequestOptions`** (`Reliability`: `'STANDARD' | 'SAFE' |
  'VERY_SAFE'`, exported). Arrivals are planned with the trip's typical delay at the median, 70th or 90th
  percentile from the environment's realtime history; left undefined, the plan follows the timetable. Paging
  keeps the level.
- **Typical delays.** `Leg.typicalArrivalDelaySeconds` is the delay planned onto the leg's arrival at the
  requested `reliability`. `Departure.typicalDelaySeconds` and `TripStop.typicalDelaySeconds` are the
  median delay at that stop for that trip on the service date's day type. All are `null` without history.
- **`Leg.interlineWithPreviousLeg`**: `true` when the rider stays on board as the vehicle continues as
  another trip, often under another line number. Not counted in `numberOfTransfers`.

### Changed

- Requests use the contract 1.1 persisted queries for plan, plan stream, departures and trip.

## 1.0.0 — 2026-10-01

Targets Spider API contract 1.0. The first stable release: from here on, breaking changes need a new major.

### Changed

- **`planStream` / `planStreamNext` / `planStreamPrevious` require `targetResults` and `maxWindowMinutes`.**
  There is no SDK default; `maxWindowMinutes` must be at least 120.
- **`WheelchairBoarding` and `BikesAllowed` use the wire spelling:** `'POSSIBLE' | 'NOT_POSSIBLE' | 'UNKNOWN'`
  and `'ALLOWED' | 'NOT_ALLOWED' | 'UNKNOWN'`.
- **Every decoded enum is a closed union with `'UNKNOWN'`** for a value this SDK version doesn't know
  (`TransitMode`, `RealtimeState`, `RoutingErrorCode`, `InputField`, `WheelchairBoarding`, `BikesAllowed`,
  `OccupancyStatus`). `NO_INFORMATION` / `NO_DATA_AVAILABLE` stay `null`.
- **HTTP 400 is `bad_request`**, with `field` set when the server names one.
- **Invalid input is rejected before any request**, as `bad_request` naming only the field (e.g.
  `maxWindow is out of range`): a stream window under 2 h, a departures `timeRange` outside (0, 86400] s,
  more than 50 realtime trip ids, a stop-search `limit` outside 1–50, a via pass-through without 1–10 stop
  ids, or a visit wait outside 0–86400 s. Nothing is clamped.
- Departures always send 30 departures over 24 h unless told otherwise; stop search always sends `limit` (20).
- An unknown persisted-query id (403 `persisted_query_rejected`) stays `unauthorized` and keeps the
  gateway's message.

### Added

- **`'query_retired'` error code** for a persisted query the API no longer serves (HTTP 410).
- **`'planning_limit_reached'` error code** when the project has reached the trip planning limit its plan
  includes (trip planning only).
- **`'agreement_inactive'` error code** when the project has no active agreement (every call).
  Both come from the response body's code whatever the HTTP status (a `vehicleForTrip` 404 carrying one is
  that error, not "no vehicle"); a 403 without one stays `unauthorized`. The message is the body's, or
  `trip planning limit reached` / `agreement is not active` when the body has none.
- **Display fields.** `Leg`: `fromGtfsId`, `toGtfsId`, `fromPlatformCode`, `toPlatformCode`, `fromZoneId`,
  `toZoneId`, `routeGtfsId`, `routeColor`, `routeTextColor`. `Departure`: `routeGtfsId`, `routeColor`,
  `routeTextColor`, `stopGtfsId`, `platformCode`, `wheelchairAccessible`. `TripDetails`: `routeGtfsId`,
  `routeColor`, `routeTextColor`, `wheelchairAccessible`. `TripStop`: `platformCode`, `zoneId`. Colours are
  the feed's GTFS hex without `#`.
- **`Departure.serviceDate` and `TripDetails.serviceDate`** (ISO `YYYY-MM-DD`); `trip()` and `delays` reject a
  malformed date.
- **`routingErrors` on the streamed `done` event.** A `LOCATION_NOT_FOUND` names `FROM`, `TO` or `VIA`.
- **Stops:** `Stop.code`, `Stop.locationType`, `Stop.wheelchairBoarding`, `Stop.modes`, and a `modes` filter on
  `StopFilter` (stops served by at least one of the modes). Search text also matches a stop's code, town
  and district.
- `RealtimeState`, `RoutingErrorCode` and `InputField` types are exported.

### Removed

- `SpiderContractMismatchError`: a gateway declaring another contract major is no longer an error.
- The departures filter that dropped rows whose headsign equals the stop name.

## 0.7.1 — 2026-09-25

Targets Spider API contract 0.7 (unchanged). Pre-1.0 release — the public API is not yet stable and may
change in backward-incompatible ways before 1.0.0.

### Changed

- **Streaming trip planning is initial + directional continuation.** `SpiderRouting.planStream(...)` opens a
  fresh stream, and its `PlanStreamEvent` is a three-variant discriminated union on `type`: `result` (a batch
  of finalized itineraries, with realtime delays on their legs), the terminal `done` (carrying the
  continuation `RoutePageInfo` — `endCursor` / `startCursor` / `hasNextPage` / `hasPreviousPage`), and
  `failure`. Continue a stream with `planStreamNext(options, endCursor)` (forward) or
  `planStreamPrevious(options, startCursor)` (backward) — both take the same options as `planStream` plus a
  raw cursor string. Batch planning (`plan` / `planNext` / `planPrevious`) is unchanged.

### Removed

- `planUntil` / `planNextUntil` / `planPreviousUntil` and the `PlanStreamOptions` / `PlanStreamPageOptions`
  types. Sweep the window with `planStream` and continue via `Done.pageInfo`.

## 0.7.0 — 2026-09-25

Targets Spider API contract 0.7. Pre-1.0 release — the public API is not yet stable and may change
in backward-incompatible ways before 1.0.0.

### Added

- **Streaming trip planning** — `SpiderRouting.planStream(...)` streams itineraries over Server-Sent
  Events as the router sweeps the search window, yielding an `AsyncGenerator` of `PlanStreamEvent`
  (`chunk` / `page` / `done` / `failure`) instead of one batched page. `targetResults` sets a soft
  floor and `maxWindowMinutes` caps the sweep; `after` / `before` continue from a `page` event's
  cursors. Distinct from `planUntil`, which window-walks batch calls. Never throws — transport/server
  errors surface as a `failure` event.
- **Realtime delays on itineraries** — `Leg` now carries the estimated times and delay fields
  (`startEstimated` / `endEstimated` / `startDelaySeconds` / `endDelaySeconds` / `isRealtime` /
  `realtimeState`) plus the GTFS `serviceDate`, on both the one-shot `plan` and streamed chunks.
- `SpiderClient.warmup()` — a best-effort `GET /ping` that pre-establishes the connection to the API
  host so the first real call skips the cold TLS/connection setup (~0.6s on mobile). Authenticated
  with the client apikey; safe to fire-and-forget — never throws, and resolves with the measured
  round-trip in milliseconds.

### Changed

- **Realtime `delays` now resolves per trip instance** (breaking). A GTFS-RT delay is bound to a
  `(tripId, serviceDate)` instance, so `SpiderRealtime.delays` takes the service date each trip runs
  on — `delays(byServiceDate)` or `delays(tripIds, serviceDate)` — and returns `TripDelays.groups`
  (a `ServiceDateDelays[]`), looked up per instance via `delayFor(delays, tripId, serviceDate)`.
  `pollDelays` mirrors the new signatures. `serviceDate` is the GTFS service date `YYYYMMDD`, taken
  from the plan leg (not the departure clock — GTFS times can exceed 24:00). The old flat
  `delays(tripIds)` is removed. Fixes cross-service-day delay bleed and midnight-overlap ambiguity.
- The client apikey is applied once per client on the shared request path, rather than re-attached
  per call.

### Fixed

- `maxTransfers` now maps to the router's boarding count (`maximumTransfers = transfers + 1`). The
  router indexes legs with leg 0 as the initial access (walk, or nothing), so passing the caller's
  transfer count verbatim made `maxTransfers` 0 and 1 behave identically. Now `0` means direct,
  `1` allows one transfer, and so on.

## 0.1.0 — 2026-08-22

Initial public pre-release; targets Spider API contract 0.1.

This is a pre-1.0 release. The public API is not yet stable and may change in
backward-incompatible ways before 1.0.0 — pin an exact version and review the
changelog before upgrading.

Covered surfaces:

- Trip planning (`planConnection`)
- Stop departures
- Single-trip lookup
- Stop search (text and geographic)
- Realtime data (vehicles, delays, alerts)
