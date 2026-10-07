import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import { badRequest, toSpiderError } from './errors.ts';
import type { TransitMode, WheelchairBoarding } from './enums.ts';
import { transitModeFromWire, wheelchairFromGtfs } from './enums.ts';

export interface Stop {
  readonly gtfsId: string;
  readonly name: string;
  /** Short public code riders know the stop by (GTFS `stop_code`). */
  readonly code: string | null;
  /** GTFS `location_type`: 0 a stop or platform, 1 a station (its platforms folded into it); null means a stop. */
  readonly locationType: number | null;
  readonly wheelchairBoarding: WheelchairBoarding | null;
  readonly lat: number;
  readonly lon: number;
  readonly country: string | null;
  readonly region: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly suburb: string | null;
  /** Modes of the routes serving the stop, each once; empty when no route serves it. */
  readonly modes: readonly TransitMode[];
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
  /** Search text, matched against the stop's name, its code, its town (`city`) and district (`suburb`). */
  readonly name?: string;
  readonly country?: string;
  readonly region?: string;
  readonly district?: string;
  readonly city?: string;
  readonly suburb?: string;
  /** Only stops served by at least one of these modes. */
  readonly modes?: readonly TransitMode[];
  /** Geographic anchor for `radiusMeters` and `sortByDistance`. */
  readonly near?: GeoPoint;
  /** Restrict to stops within this many metres of `near`. Requires `near`. */
  readonly radiusMeters?: number;
  /** Restrict to stops inside this box. Independent of `near`. */
  readonly bbox?: GeoBoundingBox;
  /** Sort results by distance from `near`, nearest first. Requires `near`. */
  readonly sortByDistance?: boolean;
  /** Most hits to return, 1 to 50 (default 20). */
  readonly limit?: number;
}

const ADMIN_KEYS = ['country', 'region', 'district', 'city', 'suburb'] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export class SpiderStops {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async search(filter: StopFilter): Promise<SpiderResult<Stop[]>> {
    const body = buildSearchRequest(filter);
    if (!(Number.isInteger(body.limit) && body.limit >= 1 && body.limit <= MAX_LIMIT)) return failure(badRequest('limit'));
    try {
      const response = await this.transport.postJson<StopSearchResponseWire>('/stops/v1/search', body, extractStopError);
      return success(response.hits.map(toStop));
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  /** Look up a single stop by its GTFS id. Resolves to the stop, or `null` when no stop matches. */
  async byId(gtfsId: string): Promise<Stop | null> {
    const body: StopSearchRequestWire = { q: '', filter: `gtfsId = "${escapeFilter(gtfsId)}"`, limit: 1 };
    const response = await this.transport.postJson<StopSearchResponseWire>('/stops/v1/search', body, extractStopError);
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
  const body: StopSearchRequestWire = { q: filter.name ?? '', limit: filter.limit ?? DEFAULT_LIMIT };
  const expression = buildFilterExpression(filter);
  if (expression != null) body.filter = expression;
  if (filter.sortByDistance === true && filter.near != null) {
    body.sort = [`_geoPoint(${filter.near.lat}, ${filter.near.lng}):asc`];
  }
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
  const modes = (filter.modes ?? []).filter((m) => m !== 'UNKNOWN');
  if (modes.length > 0) {
    clauses.push(`modes IN [${modes.map((m) => `"${escapeFilter(m)}"`).join(', ')}]`);
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
    const parsed = JSON.parse(raw) as ErrorResponseWire;
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
    code: hit.code ?? null,
    locationType: hit.locationType ?? null,
    wheelchairBoarding: wheelchairFromGtfs(hit.wheelchairBoarding),
    lat: hit.lat,
    lon: hit.lon,
    country: hit.country ?? null,
    region: hit.region ?? null,
    district: hit.district ?? null,
    city: hit.city ?? null,
    suburb: hit.suburb ?? null,
    modes: (hit.modes ?? []).map((m) => transitModeFromWire(m) ?? 'UNKNOWN'),
  };
}

interface StopSearchRequestWire {
  q: string;
  filter?: string;
  sort?: string[];
  limit: number;
}

interface StopSearchResponseWire {
  hits: StopHitWire[];
  query: string;
}

interface ErrorResponseWire {
  code: string;
  message: string;
  field?: string;
}

interface StopHitWire {
  gtfsId: string;
  name: string;
  code?: string;
  locationType?: number;
  wheelchairBoarding?: number;
  modes?: string[];
  lat: number;
  lon: number;
  country?: string;
  region?: string;
  district?: string;
  city?: string;
  suburb?: string;
  _geoDistance?: number;
}
