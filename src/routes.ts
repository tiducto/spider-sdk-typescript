import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import { SpiderContractMismatchError, toSpiderError } from './errors.ts';

export interface Route {
  readonly routeId: string;
  readonly shortName: string | null;
  readonly longName: string | null;
  readonly mode: string;
  readonly routeType: number;
  readonly agencyName: string | null;
  readonly tripCount: number;
}

export interface RouteFilter {
  /** Full-text query over shortName + longName. */
  readonly q?: string;
  /** Restrict to one transit mode, e.g. `BUS`, `TRAM`, `RAIL`. */
  readonly mode?: string;
  /** Restrict to a single operating agency. */
  readonly agency?: string;
  /** Cap the number of hits returned. */
  readonly limit?: number;
}

export class SpiderRoutes {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async search(filter: RouteFilter): Promise<SpiderResult<Route[]>> {
    const body = buildSearchRequest(filter);
    try {
      const response = await this.transport.postJson<RouteSearchResponseWire>('/routes/search', body, extractRouteError);
      return success(response.hits.map(toRoute));
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  /** Look up a single route by its feed-scoped id. Resolves to the route, or `null` when no route matches. */
  async byId(routeId: string): Promise<Route | null> {
    const body: RouteSearchRequestWire = { q: '', filter: `routeId = "${escapeFilter(routeId)}"`, limit: 1 };
    const response = await this.transport.postJson<RouteSearchResponseWire>('/routes/search', body, extractRouteError);
    const hit = response.hits[0];
    return hit != null ? toRoute(hit) : null;
  }
}

function buildSearchRequest(filter: RouteFilter): RouteSearchRequestWire {
  const body: RouteSearchRequestWire = { q: filter.q ?? '' };
  const expression = buildFilterExpression(filter);
  if (expression != null) body.filter = expression;
  if (filter.limit != null) body.limit = filter.limit;
  return body;
}

function buildFilterExpression(filter: RouteFilter): string | null {
  const clauses: string[] = [];
  if (filter.mode != null && filter.mode.length > 0) {
    clauses.push(`mode = "${escapeFilter(filter.mode)}"`);
  }
  if (filter.agency != null && filter.agency.length > 0) {
    clauses.push(`agencyName = "${escapeFilter(filter.agency)}"`);
  }
  return clauses.length > 0 ? clauses.join(' AND ') : null;
}

function escapeFilter(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function extractRouteError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as RouteSearchErrorWire;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    return raw.slice(0, 300);
  }
  return raw.slice(0, 300);
}

function toRoute(hit: RouteHitWire): Route {
  return {
    routeId: hit.routeId,
    shortName: hit.shortName ?? null,
    longName: hit.longName ?? null,
    mode: hit.mode,
    routeType: hit.routeType,
    agencyName: hit.agencyName ?? null,
    tripCount: hit.tripCount,
  };
}

interface RouteSearchRequestWire {
  q: string;
  filter?: string;
  sort?: string[];
  limit?: number;
}

interface RouteSearchResponseWire {
  hits: RouteHitWire[];
  query?: string;
}

interface RouteSearchErrorWire {
  message: string;
  code?: string;
  type?: string;
  link?: string;
}

interface RouteHitWire {
  routeId: string;
  shortName?: string | null;
  longName?: string | null;
  mode: string;
  routeType: number;
  agencyName?: string | null;
  tripCount: number;
}
