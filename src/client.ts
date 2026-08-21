import { Transport } from './http.ts';
import type { SpiderClientOptions, FeatureOptions, TransportOptions } from './http.ts';
import { CONTRACT_VERSION } from './contract.ts';
import { SpiderRouting } from './routing.ts';
import { SpiderStops } from './stops.ts';
import { SpiderRoutes } from './routes.ts';
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
  readonly routes: SpiderRoutes;
  readonly realtime: SpiderRealtime;

  constructor(baseUrl: string, apiKey: string, options?: SpiderClientOptions) {
    const base: TransportOptions = { fetch: options?.fetch, timeoutMs: options?.timeoutMs };
    this.routing = new SpiderRouting(transportFor(baseUrl, apiKey, base, options?.routing));
    this.stops = new SpiderStops(transportFor(baseUrl, apiKey, base, options?.stops));
    this.routes = new SpiderRoutes(transportFor(baseUrl, apiKey, base, options?.routes));
    this.realtime = new SpiderRealtime(transportFor(baseUrl, apiKey, base, options?.realtime));
  }

  get contractVersion(): string {
    return CONTRACT_VERSION;
  }
}
