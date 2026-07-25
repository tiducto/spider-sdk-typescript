import { Transport } from './http.ts';
import type { SpiderClientOptions } from './http.ts';
import { CONTRACT_VERSION } from './contract.ts';
import { SpiderRouting } from './routing.ts';
import { SpiderStops } from './stops.ts';
import { SpiderRealtime } from './realtime.ts';

export class SpiderClient {
  readonly routing: SpiderRouting;
  readonly stops: SpiderStops;
  readonly realtime: SpiderRealtime;

  constructor(baseUrl: string, apiKey: string, options?: SpiderClientOptions) {
    const transport = new Transport(baseUrl, apiKey, options);
    this.routing = new SpiderRouting(transport);
    this.stops = new SpiderStops(transport);
    this.realtime = new SpiderRealtime(transport);
  }

  get contractVersion(): string {
    return CONTRACT_VERSION;
  }
}
