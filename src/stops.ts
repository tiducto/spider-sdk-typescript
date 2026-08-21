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

/** A WGS84 point. `lng` mirrors the transit-industry `lon`, but the input side reads as lat/lng. */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/** A WGS84 bounding box: south-west corner (`min*`) to north-east corner (`max*`). */
export interface GeoBoundingBox {
  readonly minLat: number;
  readonly minLng: number;
  readonly maxLat: number;
  readonly maxLng: number;
}

export interface StopFilter {
  readonly name?: string;
  readonly country?: string;
  readonly region?: string;
  readonly district?: string;
  readonly city?: string;
  readonly suburb?: string;
  /** Geographic anchor for `radiusMeters` and `sortByDistance`. */
  readonly near?: GeoPoint;
  /** Restrict to stops within this many metres of `near`. Requires `near`. */
  readonly radiusMeters?: number;
  /** Restrict to stops inside this box. Independent of `near`. */
  readonly bbox?: GeoBoundingBox;
  /** Sort results by distance from `near`, nearest first. Requires `near`. */
  readonly sortByDistance?: boolean;
  /** Cap the number of hits returned. */
  readonly limit?: number;
}

const ADMIN_KEYS = ['country', 'region', 'district', 'city', 'suburb'] as const;

export class SpiderStops {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async search(filter: StopFilter): Promise<SpiderResult<Stop[]>> {
    const body = buildSearchRequest(filter);
    try {
      const response = await this.transport.postJson<StopSearchResponseWire>('/stops/search', body, extractStopError);
      return success(response.hits.map(toStop));
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  /** Look up a single stop by its GTFS id. Resolves to the stop, or `null` when no stop matches. */
  async byId(gtfsId: string): Promise<Stop | null> {
    const body: StopSearchRequestWire = { q: '', filter: `gtfsId = "${escapeFilter(gtfsId)}"`, limit: 1 };
    const response = await this.transport.postJson<StopSearchResponseWire>('/stops/search', body, extractStopError);
    const hit = response.hits[0];
    return hit != null ? toStop(hit) : null;
  }

  /** Stops around a point, nearest first. Pass `radiusMeters` to bound the search. */
  async near(lat: number, lng: number, opts?: { radiusMeters?: number; limit?: number }): Promise<SpiderResult<Stop[]>> {
    return this.search({
      near: { lat, lng },
      radiusMeters: opts?.radiusMeters,
      sortByDistance: true,
      limit: opts?.limit,
    });
  }

  /** Stops inside a bounding box. */
  async within(bbox: GeoBoundingBox, opts?: { limit?: number }): Promise<SpiderResult<Stop[]>> {
    return this.search({ bbox, limit: opts?.limit });
  }
}

function buildSearchRequest(filter: StopFilter): StopSearchRequestWire {
  if (filter.radiusMeters != null && filter.near == null) {
    throw new Error('stops.search: `radiusMeters` requires `near`');
  }
  if (filter.sortByDistance === true && filter.near == null) {
    throw new Error('stops.search: `sortByDistance` requires `near`');
  }
  const body: StopSearchRequestWire = { q: filter.name ?? '' };
  const expression = buildFilterExpression(filter);
  if (expression != null) body.filter = expression;
  if (filter.sortByDistance === true && filter.near != null) {
    body.sort = [`_geoPoint(${filter.near.lat}, ${filter.near.lng}):asc`];
  }
  if (filter.limit != null) body.limit = filter.limit;
  return body;
}

function buildFilterExpression(filter: StopFilter): string | null {
  const clauses: string[] = [];
  for (const key of ADMIN_KEYS) {
    const value = filter[key];
    if (value != null && value.length > 0) {
      clauses.push(`${escapeFilter(key)} = "${escapeFilter(value)}"`);
    }
  }
  if (filter.radiusMeters != null && filter.near != null) {
    clauses.push(`_geoRadius(${filter.near.lat}, ${filter.near.lng}, ${filter.radiusMeters})`);
  }
  if (filter.bbox != null) {
    const b = filter.bbox;
    clauses.push(`_geoBoundingBox([${b.maxLat}, ${b.maxLng}], [${b.minLat}, ${b.minLng}])`);
  }
  return clauses.length > 0 ? clauses.join(' AND ') : null;
}

function escapeFilter(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function extractStopError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as StopSearchErrorWire;
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

interface StopSearchRequestWire {
  q: string;
  filter?: string;
  sort?: string[];
  limit?: number;
}

interface StopSearchResponseWire {
  hits: StopHitWire[];
  query?: string;
}

interface StopSearchErrorWire {
  message: string;
  code?: string;
  type?: string;
  link?: string;
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
