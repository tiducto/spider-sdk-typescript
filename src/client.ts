import { Transport } from './http.ts';
import type { SpiderClientOptions, FeatureOptions, TransportOptions } from './http.ts';
import { CONTRACT_VERSION } from './contract.ts';
import { SpiderRouting } from './routing.ts';
import { SpiderStops } from './stops.ts';
import { SpiderRealtime } from './realtime.ts';

function transportFor(
  baseUrl: string,
  apiKey: string,
  base: TransportOptions,
  feature?: FeatureOptions,
): Transport {
  const retry = feature?.autoRetry != null ? { maxAttempts: feature.autoRetry.maxAttempts ?? 3 } : undefined;
  return new Transport(baseUrl, apiKey, { ...base, retry });
}

export class SpiderClient {
  readonly routing: SpiderRouting;
  readonly stops: SpiderStops;
  readonly realtime: SpiderRealtime;
  // A no-retry transport for connection-level operations (warmup). Shares the same fetch + origin
  // as the feature transports, so the connection it opens is pooled and reused by real calls.
  private readonly transport: Transport;

  constructor(baseUrl: string, apiKey: string, options?: SpiderClientOptions) {
    const base: TransportOptions = { fetch: options?.fetch, timeoutMs: options?.timeoutMs };
    this.transport = transportFor(baseUrl, apiKey, base);
    this.routing = new SpiderRouting(transportFor(baseUrl, apiKey, base, options?.routing));
    this.stops = new SpiderStops(transportFor(baseUrl, apiKey, base, options?.stops));
    this.realtime = new SpiderRealtime(transportFor(baseUrl, apiKey, base, options?.realtime));
  }

  get contractVersion(): string {
    return CONTRACT_VERSION;
  }

  /**
   * Pre-warms the connection to the API host so the first real call doesn't pay for the cold
   * TLS/connection setup. Issues one best-effort, keyless `GET /ping` through the SDK's own HTTP
   * path; the connection it establishes joins the per-origin pool that trip planning, stop, and
   * realtime calls reuse — so the ~0.6s cold handshake (notably on mobile) is spent up front
   * instead of on that first request.
   *
   * Call it once at app start, or when the app returns to the foreground. Safe to
   * fire-and-forget: it never throws or rejects — on any failure (a network error, or a non-2xx
   * such as a 404 while the gateway `/ping` route is not yet deployed) the connection was still
   * warmed and it resolves with the measured round-trip in milliseconds.
   */
  async warmup(): Promise<number> {
    return this.transport.ping();
  }
}
