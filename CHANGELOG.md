# Changelog

## 0.1.2 — 2026-09-23

- Add `SpiderClient.warmup()` — a best-effort, keyless `GET /ping` that pre-establishes the
  connection to the API host so the first real call skips the cold TLS/connection setup (~0.6s on
  mobile). It goes through the SDK's own fetch path, so the connection it opens is the one real
  calls reuse. Safe to fire-and-forget: never throws, and resolves with the measured round-trip in
  milliseconds.

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
