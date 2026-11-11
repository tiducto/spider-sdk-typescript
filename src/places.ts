import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import { badRequest, toSpiderError } from './errors.ts';
import type { PlaceType } from './enums.ts';
import { placeTypeFromWire } from './enums.ts';
import type { GeoPoint, Stop } from './stops.ts';
import { toStop } from './stops.ts';

/**
 * One place search hit: a stop, an address, a municipality or a point of interest. The admin labels
 * (`country` … `suburb`) are the areas the place lies in, labelled the same way as a `Stop`'s.
 */
export interface PlaceHit {
  /**
   * For a `STOP`, its feed-prefixed id (`<feedId>:<id>`), the stop id trip planning takes. For any other type an
   * opaque id, stable across searches.
   */
  readonly id: string;
  readonly type: PlaceType;
  /** Display name; a stop's is the operator's own. */
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /**
   * What kind of place it is: for a `POI` e.g. `university`, `hospital`, `mall`; `municipality` for a `PLACE`;
   * `building` or `recreational` for an `ADDRESS`; null for a stop. New values may appear.
   */
  readonly category: string | null;
  readonly country: string | null;
  readonly region: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly suburb: string | null;
  /** Metres from the search's `near` point; null when the search had none. */
  readonly distance: number | null;
  /** For a `STOP`, the stop as stop search returns it; undefined for any other type. */
  readonly stop?: Stop;
}

export interface PlaceSearchOptions {
  /** Rank the nearer of equally good matches first, and give each hit its `distance`. */
  readonly near?: GeoPoint;
  /** Most hits to return, 1 to 20 (default 10). */
  readonly limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export class SpiderPlaces {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /**
   * Places matching `query` in the environment's service area, best first: stops, addresses, municipalities (`PLACE`)
   * and points of interest. `query` is 2 to 100 characters; abbreviated and spelled-out forms find each other, and
   * text without diacritics matches text with them. A query with a house number (any digit, as in `Údolní 53`) lists
   * individual addresses; without one, it lists stops, municipalities and points of interest, and no addresses. A
   * limit outside 1–20 fails as `bad_request` without a request.
   */
  async search(query: string, options?: PlaceSearchOptions): Promise<SpiderResult<PlaceHit[]>> {
    const limit = options?.limit ?? DEFAULT_LIMIT;
    if (!(Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT)) return failure(badRequest('limit'));
    const params: Record<string, string> = { q: query, limit: String(limit) };
    if (options?.near != null) {
      params.latitude = String(options.near.lat);
      params.longitude = String(options.near.lng);
    }
    try {
      const response = await this.transport.getJson<PlaceSearchResponseWire>('/places/v1/search', params);
      return success(response.hits.map(toPlaceHit));
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }
}

function toPlaceHit(hit: PlaceHitWire): PlaceHit {
  const gtfsId = hit.gtfsId;
  const stop = hit.type === 'stop' && gtfsId != null ? toStop({ ...hit, gtfsId }) : undefined;
  return {
    id: hit.id,
    type: placeTypeFromWire(hit.type),
    name: hit.name,
    lat: hit.lat,
    lon: hit.lon,
    category: hit.category ?? null,
    country: hit.country ?? null,
    region: hit.region ?? null,
    district: hit.district ?? null,
    city: hit.city ?? null,
    suburb: hit.suburb ?? null,
    distance: hit.distance ?? null,
    ...(stop != null ? { stop } : {}),
  };
}

interface PlaceSearchResponseWire {
  hits: PlaceHitWire[];
  query: string;
}

interface PlaceHitWire {
  id: string;
  type: string;
  gtfsId?: string;
  name: string;
  code?: string;
  wheelchairBoarding?: number;
  modes?: string[];
  lat: number;
  lon: number;
  category?: string;
  country?: string;
  region?: string;
  district?: string;
  city?: string;
  suburb?: string;
  distance?: number;
}
