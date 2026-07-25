import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import { SpiderContractMismatchError, toSpiderError } from './errors.ts';

export interface Stop {
  readonly gtfsId: string;
  readonly name: string;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly country: string | null;
  readonly region: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly suburb: string | null;
}

export interface StopFilter {
  readonly name?: string;
  readonly country?: string;
  readonly region?: string;
  readonly district?: string;
  readonly city?: string;
  readonly suburb?: string;
}

const ADMIN_KEYS = ['country', 'region', 'district', 'city', 'suburb'] as const;

export class SpiderStops {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async search(filter: StopFilter): Promise<SpiderResult<Stop[]>> {
    try {
      const q = filter.name ?? '';
      const expression = buildFilterExpression(filter);
      const body = expression != null ? { q, filter: expression } : { q };
      const response = await this.transport.postJson<StopSearchResponseWire>('/stops/search', body, extractStopError);
      return success(response.hits.map(toStop));
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }
}

function buildFilterExpression(filter: StopFilter): string | null {
  const clauses: string[] = [];
  for (const key of ADMIN_KEYS) {
    const value = filter[key];
    if (value != null && value.length > 0) {
      clauses.push(`"${escapeFilter(key)}" = "${escapeFilter(value)}"`);
    }
  }
  return clauses.length > 0 ? clauses.join(' AND ') : null;
}

function escapeFilter(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function extractStopError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    return raw.slice(0, 300);
  }
  return raw.slice(0, 300);
}

function toStop(hit: StopHitWire): Stop {
  return {
    gtfsId: hit.gtfsId,
    name: hit.name,
    lat: hit.lat ?? null,
    lon: hit.lon ?? null,
    country: hit.country ?? null,
    region: hit.region ?? null,
    district: hit.district ?? null,
    city: hit.city ?? null,
    suburb: hit.suburb ?? null,
  };
}

interface StopSearchResponseWire {
  hits: StopHitWire[];
  query?: string;
}

interface StopHitWire {
  gtfsId: string;
  name: string;
  lat?: number | null;
  lon?: number | null;
  country?: string | null;
  region?: string | null;
  district?: string | null;
  city?: string | null;
  suburb?: string | null;
}
