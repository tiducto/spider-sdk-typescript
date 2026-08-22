# @tiducto/spider-sdk-typescript

The TypeScript SDK for **Spider** — the managed transit API by Tiducto. Trip planning, stop search, and live realtime data behind one typed client that ships the exact queries the gateway allows and attaches auth for you.

Native TypeScript, zero runtime dependencies (uses the platform `fetch`). Sibling of the Kotlin, Swift, and Dart SDKs — same domain model, TypeScript idioms.

## Install

```bash
npm install @tiducto/spider-sdk-typescript
```

Requires Node.js 20+ or any modern browser (anything with a global `fetch`).

## Quickstart

```ts
import { SpiderClient, Location } from '@tiducto/spider-sdk-typescript';

const client = new SpiderClient('https://your-env-slug.api.tiducto.eu', process.env.SPIDER_API_KEY!);

const result = await client.routing.plan({
  origin: Location.coordinate(49.19, 16.61),
  destination: Location.coordinate(49.23, 16.53),
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

Every call returns a `SpiderResult<T>` you branch on before reading `data`; only a contract-version mismatch throws (`SpiderContractMismatchError`). The API key is sent in an `apikey` header and is scoped to a single project + environment — the env's routing slug is the subdomain of the base URL.

## What's in it

- **`client.routing`** — trip planning (with paging), departures, and single-trip lookups.
- **`client.stops`** — text/autocomplete search, geo queries (nearest / bounding box), and lookup by GTFS id.
- **`client.realtime`** — poll-based live vehicle positions, delays, and alerts (no push connections).

**Full API reference and guides → [docs.tiducto.eu](https://docs.tiducto.eu).** Product overview → [tiducto.eu](https://tiducto.eu).

## Contributing

`src/contract/routing` is generated from [`tiducto/spider-contract`](https://github.com/tiducto/spider-contract) — don't hand-edit it. `npm run build` / `npm run typecheck` / `npm test`.

## License

Apache-2.0 — see [LICENSE](LICENSE).
