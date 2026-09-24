# Changelog

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
