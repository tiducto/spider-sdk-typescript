import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import type { SpiderError } from './errors.ts';
import { DecodingError, SpiderContractMismatchError, TransportError, parseErrorEnvelope, toSpiderError } from './errors.ts';
import type { BikesAllowed, TransitMode, WheelchairBoarding } from './enums.ts';
import { bikesAllowedFromWire, transitModeFromWire, wheelchairFromWire } from './enums.ts';
import type { Location, ViaLocation } from './location.ts';
import { decodePolyline } from './polyline.ts';
import { DEPARTURES, PLAN, PLAN_STREAM, TRIP } from './persistedQueries.ts';
import type {
  PlanConnectionData as PlanConnectionDataWire,
  PlanConnectionStreamVariables,
  PlanConnectionVariables,
  PlanModesInput,
  PlanPreferencesInput,
  RoutingErrorCode,
  InputField,
  Itinerary as ItineraryWire,
  Leg as LegWire,
  PlanLabeledLocationInput,
  PlanViaLocationInput,
  StopDeparturesData as StopDeparturesDataWire,
  StopDeparturesVariables,
  StopDeparturesStop as DeparturesStopWire,
  RealtimeState,
  TransitMode as WireTransitMode,
  TripData as TripDataWire,
  TripVariables,
  TripTrip as TripTripWire,
} from './contract/routing/index.ts';

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export interface Leg {
  readonly mode: TransitMode | null;
  readonly startScheduled: string;
  readonly endScheduled: string;
  /** Estimated (realtime-adjusted) departure ISO time, when the feed reported one; otherwise null. */
  readonly startEstimated: string | null;
  /** Estimated (realtime-adjusted) arrival ISO time, when the feed reported one; otherwise null. */
  readonly endEstimated: string | null;
  /** Departure schedule deviation in seconds (positive = late), when known; otherwise null. */
  readonly startDelaySeconds: number | null;
  /** Arrival schedule deviation in seconds (positive = late), when known; otherwise null. */
  readonly endDelaySeconds: number | null;
  readonly isRealtime: boolean;
  readonly realtimeState: RealtimeState | null;
  /** GTFS service date this leg's trip runs on (`YYYYMMDD`) — pass to realtime `delays` lookups. */
  readonly serviceDate: string | null;
  readonly fromName: string | null;
  readonly toName: string | null;
  readonly routeShortName: string | null;
  readonly routeLongName: string | null;
  readonly headsign: string | null;
  readonly distanceMeters: number | null;
  readonly durationSeconds: number | null;
  readonly tripGtfsId: string | null;
  readonly bikesAllowed: BikesAllowed | null;
  readonly accessibilityScore: number | null;
  readonly fromWheelchair: WheelchairBoarding | null;
  readonly toWheelchair: WheelchairBoarding | null;
  readonly geometry: readonly LatLon[];
}

export interface Itinerary {
  readonly start: string | null;
  readonly end: string | null;
  readonly durationSeconds: number;
  readonly waitingTimeSeconds: number | null;
  readonly numberOfTransfers: number;
  readonly accessibilityScore: number | null;
  readonly legs: readonly Leg[];
}

export interface RouteEdge {
  readonly cursor: string;
  readonly itinerary: Itinerary;
}

export interface RoutePageInfo {
  readonly startCursor: string | null;
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly searchWindowUsed: string | null;
}

export interface RoutingError {
  readonly code: RoutingErrorCode;
  readonly description: string;
  readonly inputField: InputField | null;
}

export interface Route {
  readonly edges: readonly RouteEdge[];
  readonly pageInfo: RoutePageInfo;
  readonly routingErrors: readonly RoutingError[];
  readonly searchDateTime: string | null;
}

/**
 * One event from {@link SpiderRouting.planStream}. The router sweeps the search window forward and pushes
 * itineraries as they finalize: zero or more `chunk`s, then a `page` with the continuation cursors, then a
 * terminal `done`. A `failure` is terminal and takes the place of the rest.
 */
export type PlanStreamEvent =
  | {
      /** A batch of finalized itineraries as the search frontier advances (with realtime delays on their legs). */
      readonly kind: 'chunk';
      /** How far (seconds from the search start) the window has swept. */
      readonly frontierSeconds: number;
      /** Running count of itineraries discovered so far. */
      readonly found: number;
      /** Count of itineraries committed (finalized) so far. */
      readonly finalized: number;
      readonly itineraries: readonly Itinerary[];
    }
  | {
      /** Continuation cursors for the stream, mirroring {@link Route.pageInfo}. */
      readonly kind: 'page';
      readonly pageInfo: RoutePageInfo;
    }
  | {
      /** Terminal summary once the sweep stops. */
      readonly kind: 'done';
      readonly iterations: number;
      readonly windowSeconds: number;
      readonly resultCount: number;
      /** Why the sweep stopped (e.g. `targetResults` or `maxWindow`). */
      readonly stoppedBy: string;
    }
  | {
      /** Terminal failure — a transport/HTTP problem, a decoding error, or a server `error` event. */
      readonly kind: 'failure';
      readonly error: SpiderError;
    };

export interface Departure {
  readonly scheduledTimeEpochMs: number;
  readonly realtimeTimeEpochMs: number | null;
  readonly isRealtime: boolean;
  readonly realtimeState: RealtimeState | null;
  readonly headsign: string | null;
  readonly tripGtfsId: string | null;
  readonly routeShortName: string | null;
  readonly routeLongName: string | null;
  readonly mode: TransitMode | null;
}

export interface TripStop {
  readonly gtfsId: string;
  readonly name: string;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly scheduledArrivalEpochMs: number | null;
  readonly scheduledDepartureEpochMs: number | null;
  readonly realtimeArrivalEpochMs: number | null;
  readonly realtimeDepartureEpochMs: number | null;
  readonly isRealtime: boolean;
  readonly wheelchairBoarding: WheelchairBoarding | null;
}

export interface TripDetails {
  readonly gtfsId: string;
  readonly routeShortName: string | null;
  readonly routeLongName: string | null;
  readonly mode: TransitMode | null;
  readonly headsign: string | null;
  readonly directionId: string | null;
  readonly bikesAllowed: BikesAllowed | null;
  readonly stops: readonly TripStop[];
  readonly geometry: readonly LatLon[];
}

export interface PlanOptions {
  readonly origin: Location;
  readonly destination: Location;
  readonly departAt?: number | Date;
  readonly arriveBy?: number | Date;
  readonly via?: readonly ViaLocation[];
  /** Restrict routing to these transit modes. Undefined/empty = no filter (all modes); WALK/UNKNOWN drop out. */
  readonly allowedTransitModes?: readonly TransitMode[];
  /** Absolute cap on transfers in any returned itinerary. Undefined = OTP default. */
  readonly maxTransfers?: number;
  /**
   * Search window in minutes (default 60). Always sent, deliberately not OTP's dynamic route-dependent
   * window — predictable cost + paging. Widen for sparse/intercity routes.
   */
  readonly searchWindowMinutes?: number;
  /** Prefer wheelchair-accessible routing. */
  readonly wheelchairAccessible?: boolean;
}

/** Options for the streaming `planUntil` — the plan filters plus the walk's bounds. `searchWindowMinutes` is the step. */
export interface PlanStreamOptions extends PlanOptions {
  /** Stop once ~this many itineraries have been collected (soft — the window that reaches it is yielded whole). */
  readonly targetResults?: number;
  /** Stop after stepping through this much total time (default 360 = 6h). `searchWindowMinutes` is the step size. */
  readonly maxTraversalMinutes?: number;
}

/** Bounds for the streaming continuations `planNextUntil` / `planPreviousUntil` (the step is fixed from `prev`). */
export interface PlanStreamPageOptions {
  readonly targetResults?: number;
  readonly maxTraversalMinutes?: number;
}

/**
 * Options for {@link SpiderRouting.planStream} — the server-push SSE stream. Distinct from `planUntil`, which
 * window-walks batch calls client-side: `planStream` opens one long-lived Server-Sent Events request and the
 * router pushes itineraries (with realtime delays) as it sweeps the window forward.
 */
export interface PlanStreamRequestOptions {
  readonly origin: Location;
  readonly destination: Location;
  readonly departAt?: number | Date;
  readonly arriveBy?: number | Date;
  readonly via?: readonly ViaLocation[];
  readonly allowedTransitModes?: readonly TransitMode[];
  readonly maxTransfers?: number;
  readonly wheelchairAccessible?: boolean;
  /** Soft floor: the router keeps sweeping until at least this many itineraries are found (default 5). */
  readonly targetResults?: number;
  /** Cap on how far forward the sweep searches, in minutes (default 360 = 6h). */
  readonly maxWindowMinutes?: number;
  /** Continue a prior stream forward from a `page` event's `endCursor`. */
  readonly after?: string;
  /** Continue a prior stream backward from a `page` event's `startCursor`. */
  readonly before?: string;
}

export interface DeparturesOptions {
  readonly startTime?: number | Date;
  readonly timeRangeSeconds?: number;
}

const DEFAULT_SEARCH_WINDOW_MINUTES = 60;
const DEFAULT_MAX_TRAVERSAL_MINUTES = 360;
const DEFAULT_TARGET_RESULTS = 10;
const DEFAULT_STREAM_TARGET_RESULTS = 5;
const DEFAULT_MAX_WINDOW_MINUTES = 360;
const DEFAULT_TIME_RANGE_SECONDS = 24 * 60 * 60;
const INT_MAX = 2_147_483_647;

// The OTP transit modes valid in a modes filter — the public TransitMode union also carries street/leg
// values (WALK, BICYCLE, CAR, TRANSIT, UNKNOWN) that are not transit modes and must not reach the wire.
const WIRE_TRANSIT_MODES: ReadonlySet<string> = new Set([
  'AIRPLANE', 'BUS', 'CABLE_CAR', 'CARPOOL', 'COACH', 'FERRY', 'FUNICULAR', 'GONDOLA',
  'MONORAIL', 'RAIL', 'SNOW_AND_ICE', 'SUBWAY', 'TAXI', 'TRAM', 'TROLLEYBUS',
]);

interface RouteTimeSpec {
  readonly kind: 'departAt' | 'arriveBy';
  readonly epochMs: number;
}

interface PlanRequest {
  readonly origin: Location;
  readonly destination: Location;
  readonly time: RouteTimeSpec;
  readonly via: readonly ViaLocation[];
  readonly allowedTransitModes: readonly TransitMode[];
  readonly maxTransfers?: number;
  readonly searchWindowMinutes: number;
  readonly wheelchairAccessible: boolean;
}

const ROUTE_REQUEST = Symbol('spider.routeRequest');
type RouteWithRequest = Route & { readonly [ROUTE_REQUEST]: PlanRequest };

export class SpiderRouting {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async plan(options: PlanOptions): Promise<SpiderResult<Route>> {
    const time: RouteTimeSpec = options.arriveBy != null
      ? { kind: 'arriveBy', epochMs: toEpochMs(options.arriveBy) }
      : { kind: 'departAt', epochMs: toEpochMs(options.departAt ?? Date.now()) };
    const request: PlanRequest = {
      origin: options.origin,
      destination: options.destination,
      time,
      via: options.via ?? [],
      allowedTransitModes: options.allowedTransitModes ?? [],
      maxTransfers: options.maxTransfers,
      searchWindowMinutes: options.searchWindowMinutes ?? DEFAULT_SEARCH_WINDOW_MINUTES,
      wheelchairAccessible: options.wheelchairAccessible ?? false,
    };
    return this.page(request);
  }

  /**
   * Streams itineraries over Server-Sent Events as the router sweeps the search window forward, emitting them
   * as they finalize instead of one batched page. Lazy and cancellable: iteration opens the request, and
   * `break`ing out of the `for await` cancels the underlying stream. Each `chunk` event carries itineraries
   * with realtime delays already on their legs; a `page` event then carries the continuation cursors and a
   * `done` event closes the stream (or a terminal `failure`). Never throws for transport/HTTP/server errors —
   * they surface as a `failure` event — except a contract-version mismatch, which throws like the batch calls.
   *
   * `targetResults` is a soft floor the sweep aims to reach; `maxWindowMinutes` caps how far forward it
   * searches. To continue, re-call with the same inputs plus `after` = the last `page` event's `endCursor`
   * (or `before` = `startCursor` to walk earlier). For a single batched page instead, use {@link plan}.
   */
  async *planStream(options: PlanStreamRequestOptions): AsyncGenerator<PlanStreamEvent> {
    const time: RouteTimeSpec = options.arriveBy != null
      ? { kind: 'arriveBy', epochMs: toEpochMs(options.arriveBy) }
      : { kind: 'departAt', epochMs: toEpochMs(options.departAt ?? Date.now()) };
    const iso = new Date(time.epochMs).toISOString();
    const via = options.via ?? [];
    const maxWindowMinutes = Math.max(1, Math.floor(options.maxWindowMinutes ?? DEFAULT_MAX_WINDOW_MINUTES));
    const variables: PlanConnectionStreamVariables = {
      dateTime: time.kind === 'departAt' ? { earliestDeparture: iso } : { latestArrival: iso },
      origin: locationToInput(options.origin),
      destination: locationToInput(options.destination),
      via: via.length > 0 ? via.map(viaToInput) : undefined,
      modes: modesInput(options.allowedTransitModes ?? []),
      preferences: preferencesInput({
        maxTransfers: options.maxTransfers,
        wheelchairAccessible: options.wheelchairAccessible ?? false,
      }),
      targetResults: options.targetResults ?? DEFAULT_STREAM_TARGET_RESULTS,
      maxWindow: `PT${maxWindowMinutes}M`,
      before: options.before,
      after: options.after,
    };
    yield* this.openPlanStream(variables);
  }

  // Opens the SSE `plan-stream` request and turns its `chunk`/`pageInfo`/`done`/`error` records into a
  // PlanStreamEvent stream. A non-2xx response, a transport error, or a decoding slip becomes a terminal
  // `failure` event rather than a throw (a contract mismatch still throws). Reading stops when the server
  // closes the stream or the consumer stops iterating (which cancels the reader → aborts the request).
  private async *openPlanStream(variables: PlanConnectionStreamVariables): AsyncGenerator<PlanStreamEvent> {
    let response: Response;
    try {
      response = await this.transport.stream(PLAN_STREAM, variables);
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      yield { kind: 'failure', error: toSpiderError(e) };
      return;
    }
    if (!response.ok) {
      const text = await drainText(response);
      const env = parseErrorEnvelope(text);
      const detail = env.message ?? text.slice(0, 300);
      const err = new TransportError('http', `routing plan-stream -> ${response.status}: ${detail}`, response.status, env.code);
      yield { kind: 'failure', error: toSpiderError(err) };
      return;
    }
    const body = response.body;
    if (body == null) {
      yield { kind: 'failure', error: toSpiderError(new TransportError('no_data', 'routing plan-stream returned no body')) };
      return;
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        // SSE records are separated by a blank line; parse every complete one and keep the remainder buffered.
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const record = parseSseFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          const event = parsePlanStreamRecord(record.event, record.data);
          if (event != null) yield event;
        }
      }
      // A trailing record the server didn't terminate with a blank line before closing.
      const record = parseSseFrame(buffer);
      const event = parsePlanStreamRecord(record.event, record.data);
      if (event != null) yield event;
    } catch (e) {
      yield { kind: 'failure', error: toSpiderError(e) };
    } finally {
      await reader.cancel().catch(() => {});
    }
  }

  async planNext(route: Route): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasNextPage) return null;
    // Forward paging = after (no count; the server returns a whole window per page).
    return this.page(requestOf(route), undefined, route.pageInfo.endCursor ?? undefined);
  }

  async planPrevious(route: Route): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasPreviousPage) return null;
    // Backward paging = before (no count; the server returns a whole window per page).
    return this.page(requestOf(route), route.pageInfo.startCursor ?? undefined, undefined);
  }

  /**
   * Streams itineraries by stepping the search forward one search window at a time, until `targetResults`
   * itineraries have been collected or `maxTraversalMinutes` of time has been traversed. Each step pulls a
   * whole window in one search, so a busy window yields more — `targetResults` is a soft floor, the window
   * that reaches it is yielded whole. Lazy: `for await ... break` stops stepping and skips the remaining OTP
   * searches. Each yield is one step's `SpiderResult` (a terminal error ends the stream), matching the
   * non-throwing poll helpers.
   *
   * The step is `searchWindowMinutes` and it is fixed for the whole walk — OTP locks the window into the
   * paging cursor after the first search and ignores it thereafter, so a wider step means a wider
   * `searchWindowMinutes` here, not on a continuation.
   */
  async *planUntil(options: PlanStreamOptions): AsyncGenerator<SpiderResult<Route>> {
    const { targetResults, maxTraversalMinutes, ...planOptions } = options;
    const target = targetResults ?? DEFAULT_TARGET_RESULTS;
    const steps = stepCount(
      maxTraversalMinutes ?? DEFAULT_MAX_TRAVERSAL_MINUTES,
      options.searchWindowMinutes ?? DEFAULT_SEARCH_WINDOW_MINUTES,
    );
    const first = await this.plan(planOptions);
    yield first;
    if (!first.isSuccess) return;
    yield* this.stepFrom(first.data, 'forward', steps - 1, target, first.data.edges.length);
  }

  /** Streaming form of `planNext`: steps forward from `prev`, one (fixed) search window per step. */
  async *planNextUntil(prev: Route, options?: PlanStreamPageOptions): AsyncGenerator<SpiderResult<Route>> {
    const steps = stepCount(options?.maxTraversalMinutes ?? DEFAULT_MAX_TRAVERSAL_MINUTES, requestOf(prev).searchWindowMinutes);
    yield* this.stepFrom(prev, 'forward', steps, options?.targetResults ?? DEFAULT_TARGET_RESULTS, 0);
  }

  /** Streaming form of `planPrevious`: steps backward from `prev`, one (fixed) search window per step. */
  async *planPreviousUntil(prev: Route, options?: PlanStreamPageOptions): AsyncGenerator<SpiderResult<Route>> {
    const steps = stepCount(options?.maxTraversalMinutes ?? DEFAULT_MAX_TRAVERSAL_MINUTES, requestOf(prev).searchWindowMinutes);
    yield* this.stepFrom(prev, 'backward', steps, options?.targetResults ?? DEFAULT_TARGET_RESULTS, 0);
  }

  // Step from `start` one search window at a time, accumulating itinerary count. Stop at `targetResults`, when a
  // step has no next page, or on an error. `collectedSoFar` seeds the count (planUntil already yielded step 1).
  private async *stepFrom(
    start: Route,
    direction: 'forward' | 'backward',
    remainingSteps: number,
    targetResults: number,
    collectedSoFar: number,
  ): AsyncGenerator<SpiderResult<Route>> {
    if (collectedSoFar >= targetResults) return;
    let prev = start;
    let collected = collectedSoFar;
    for (let i = 0; i < Math.max(0, remainingSteps); i++) {
      const res = direction === 'forward'
        ? await this.planNext(prev)
        : await this.planPrevious(prev);
      if (res === null) return;
      yield res;
      if (!res.isSuccess) return;
      collected += res.data.edges.length;
      if (collected >= targetResults) return;
      prev = res.data;
    }
  }

  async departures(
    stopId: string,
    numberOfDepartures = 30,
    options?: DeparturesOptions,
  ): Promise<SpiderResult<Departure[]>> {
    try {
      const variables: StopDeparturesVariables = {
        id: stopId,
        numberOfDepartures,
        startTime: options?.startTime != null ? Math.floor(toEpochMs(options.startTime) / 1000) : undefined,
        timeRange: clampSeconds(options?.timeRangeSeconds ?? DEFAULT_TIME_RANGE_SECONDS),
      };
      const data = await this.transport.graphql<StopDeparturesDataWire>(DEPARTURES, variables);
      const stop = data.asStop ?? data.asStation;
      if (stop == null) {
        throw new TransportError('no_data', `routing returned no stop or station for id=${stopId}`);
      }
      return success(mapDepartures(stop));
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  async trip(tripId: string, serviceDate?: string): Promise<SpiderResult<TripDetails>> {
    try {
      const variables: TripVariables = { id: tripId, serviceDate };
      const data = await this.transport.graphql<TripDataWire>(TRIP, variables);
      const trip = data.trip;
      if (trip == null) {
        throw new TransportError('no_data', `routing returned no trip for id=${tripId}`);
      }
      return success(mapTrip(trip));
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  private async page(
    request: PlanRequest,
    before?: string,
    after?: string,
  ): Promise<SpiderResult<Route>> {
    try {
      return success(await this.fetchPlan(request, before, after));
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  private async fetchPlan(
    request: PlanRequest,
    before?: string,
    after?: string,
  ): Promise<Route> {
    const iso = new Date(request.time.epochMs).toISOString();
    const dateTime = request.time.kind === 'departAt'
      ? { earliestDeparture: iso }
      : { latestArrival: iso };
    const variables: PlanConnectionVariables = {
      dateTime,
      origin: locationToInput(request.origin),
      destination: locationToInput(request.destination),
      via: request.via.length > 0 ? request.via.map(viaToInput) : undefined,
      modes: modesInput(request.allowedTransitModes),
      preferences: preferencesInput(request),
      // Floor to a whole minute, min 1 — a sub-minute window returns almost nothing on OTP.
      searchWindow: `PT${Math.max(1, Math.floor(request.searchWindowMinutes))}M`,
      before,
      after,
    };
    const data = await this.transport.graphql<PlanConnectionDataWire>(PLAN, variables);
    const plan = data.planConnection;
    if (plan == null) {
      throw new TransportError('no_data', 'routing returned no plan data');
    }
    const route: Route = {
      edges: (plan.edges ?? []).map((edge) => ({ cursor: edge.cursor, itinerary: mapItinerary(edge.node) })),
      pageInfo: {
        startCursor: plan.pageInfo.startCursor ?? null,
        endCursor: plan.pageInfo.endCursor ?? null,
        hasNextPage: plan.pageInfo.hasNextPage,
        hasPreviousPage: plan.pageInfo.hasPreviousPage,
        searchWindowUsed: plan.pageInfo.searchWindowUsed ?? null,
      },
      routingErrors: plan.routingErrors.map((re) => ({
        code: re.code,
        description: re.description,
        inputField: re.inputField ?? null,
      })),
      searchDateTime: plan.searchDateTime ?? null,
    };
    return Object.assign({}, route, { [ROUTE_REQUEST]: request });
  }
}

function requestOf(route: Route): PlanRequest {
  return (route as RouteWithRequest)[ROUTE_REQUEST];
}

function toEpochMs(value: number | Date): number {
  return typeof value === 'number' ? value : value.getTime();
}

function clampSeconds(seconds: number): number {
  return Math.max(0, Math.min(Math.floor(seconds), INT_MAX));
}

// Each cursor step advances a full (fixed) search window, so the number of steps to traverse the total time
// is a plain division by the step — no searchWindowUsed math.
function stepCount(maxTraversalMinutes: number, stepMinutes: number): number {
  return Math.max(1, Math.floor(maxTraversalMinutes / Math.max(1, stepMinutes)));
}

function locationToInput(location: Location): PlanLabeledLocationInput {
  if (location.kind === 'stop') {
    return { location: { stopLocation: { stopLocationId: location.id } } };
  }
  return { location: { coordinate: { latitude: location.latitude, longitude: location.longitude } } };
}

function viaToInput(via: ViaLocation): PlanViaLocationInput {
  if (via.kind === 'passThrough') {
    return { passThrough: { stopLocationIds: [...via.stopIds] } };
  }
  const minimumWaitTime = via.minimumWaitSeconds > 0 ? `PT${via.minimumWaitSeconds}S` : undefined;
  if (via.location.kind === 'stop') {
    return { visit: { stopLocationIds: [via.location.id], minimumWaitTime } };
  }
  return {
    visit: {
      coordinate: { latitude: via.location.latitude, longitude: via.location.longitude },
      minimumWaitTime,
    },
  };
}

// Curated PlanRequest → OTP's nested modes/preferences inputs. Only the exposed fields are set; everything
// else stays undefined so OTP applies its own defaults. Both return undefined when nothing is requested.
function modesInput(modes: readonly TransitMode[]): PlanModesInput | undefined {
  const transit = modes
    .filter((m): m is WireTransitMode => WIRE_TRANSIT_MODES.has(m))
    .map((mode) => ({ mode }));
  return transit.length > 0 ? { transit: { transit } } : undefined;
}

function preferencesInput(request: { maxTransfers?: number; wheelchairAccessible: boolean }): PlanPreferencesInput | undefined {
  // The router indexes legs with leg 0 = the initial access (walk, or nothing), so its wire
  // `maximumTransfers` counts boardings = transfers + 1 (wire 0 = walk-only, not exposed here).
  // `maxTransfers` is a transfer count, so map it to boardings: 0 transfers = 1 boarding (direct).
  const transit = request.maxTransfers != null
    ? { transfer: { maximumTransfers: request.maxTransfers + 1 } }
    : undefined;
  const accessibility = request.wheelchairAccessible ? { wheelchair: { enabled: true } } : undefined;
  if (transit === undefined && accessibility === undefined) return undefined;
  return { transit, accessibility };
}

// ISO-8601 time-only duration (e.g. "PT1M30S", "PT-90S") → seconds, with a plain-integer-seconds fallback;
// mirrors the batch plan's realtime-delay handling. Returns null for absent or unparseable values.
function durationSecondsFromWire(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const iso = /^(-)?PT(?:(-?\d+)H)?(?:(-?\d+)M)?(?:(-?\d+(?:\.\d+)?)S)?$/i.exec(raw);
  if (iso != null && (iso[2] != null || iso[3] != null || iso[4] != null)) {
    const sign = iso[1] === '-' ? -1 : 1;
    return sign * (Number(iso[2] ?? 0) * 3600 + Number(iso[3] ?? 0) * 60 + Number(iso[4] ?? 0));
  }
  const plain = Number(raw);
  return Number.isFinite(plain) ? plain : null;
}

const SSE_DEFAULT_EVENT = 'message';

// Parses one finished SSE record (its event name + accumulated data) into a PlanStreamEvent; returns null for
// records the SDK doesn't surface (heartbeats, unknown events). A malformed payload becomes a terminal
// `failure` rather than throwing. Exported so the wire-contract test exercises it directly.
export function parsePlanStreamRecord(event: string, data: string): PlanStreamEvent | null {
  if (data.trim() === '') return null;
  switch (event) {
    case 'chunk':
      return decodeStreamRecord('chunk', data, (chunk: StreamChunkWire) => ({
        kind: 'chunk',
        frontierSeconds: chunk.frontier ?? 0,
        found: chunk.found ?? 0,
        finalized: chunk.finalized ?? 0,
        itineraries: (chunk.results ?? []).map(mapItinerary),
      }));
    case 'pageInfo':
      return decodeStreamRecord('pageInfo', data, (page: StreamPageInfoWire) => ({
        kind: 'page',
        pageInfo: {
          startCursor: page.startCursor ?? null,
          endCursor: page.endCursor ?? null,
          hasNextPage: page.hasNextPage ?? false,
          hasPreviousPage: page.hasPreviousPage ?? false,
          searchWindowUsed: page.searchWindowUsed ?? null,
        },
      }));
    case 'done':
      return decodeStreamRecord('done', data, (done: StreamDoneWire) => ({
        kind: 'done',
        iterations: done.iterations ?? 0,
        windowSeconds: done.windowSeconds ?? 0,
        resultCount: done.resultCount ?? 0,
        stoppedBy: done.stoppedBy ?? 'unknown',
      }));
    case 'error':
      return { kind: 'failure', error: streamErrorToSpiderError(data) };
    default:
      return null;
  }
}

function decodeStreamRecord<W>(kind: string, data: string, map: (parsed: W) => PlanStreamEvent): PlanStreamEvent {
  try {
    return map(JSON.parse(data) as W);
  } catch (e) {
    return { kind: 'failure', error: toSpiderError(new DecodingError(`failed to decode plan-stream ${kind}`, e)) };
  }
}

// Splits one raw SSE record into its event name (default "message") and data (multiple `data:` lines joined
// with "\n"), per the SSE line format: `field: value`, a leading space after the colon stripped, `:` comments
// and blank lines ignored.
function parseSseFrame(record: string): { event: string; data: string } {
  let event = SSE_DEFAULT_EVENT;
  const data: string[] = [];
  for (const line of record.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return { event, data: data.join('\n') };
}

// A stream `error` record is the same GraphQL error envelope the batch path returns, so it maps through the
// same taxonomy — a top-level BAD_REQUEST becomes a typed bad_request (with its field), anything else server.
function streamErrorToSpiderError(data: string): SpiderError {
  let env: { errors?: StreamGraphQLError[]; message?: string };
  try {
    env = JSON.parse(data) as { errors?: StreamGraphQLError[]; message?: string };
  } catch {
    return toSpiderError(new TransportError('upstream', `plan-stream error: ${data.slice(0, 300)}`));
  }
  const errors = env.errors;
  if (errors != null && errors.length > 0) {
    const bad = errors.find((e) => e.extensions?.code === 'BAD_REQUEST');
    if (bad != null) {
      return toSpiderError(new TransportError('bad_request', bad.message, undefined, undefined, bad.extensions?.field));
    }
    return toSpiderError(new TransportError('upstream', `plan-stream errors: ${errors.map((e) => e.message).join(', ')}`));
  }
  return toSpiderError(new TransportError('upstream', `plan-stream error: ${env.message ?? data.slice(0, 300)}`));
}

async function drainText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

interface StreamChunkWire {
  frontier?: number;
  found?: number;
  finalized?: number;
  results?: ItineraryWire[];
}

interface StreamPageInfoWire {
  startCursor?: string | null;
  endCursor?: string | null;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  searchWindowUsed?: string | null;
}

interface StreamDoneWire {
  iterations?: number;
  windowSeconds?: number;
  resultCount?: number;
  stoppedBy?: string;
}

interface StreamGraphQLError {
  message: string;
  extensions?: { code?: string; field?: string } | null;
}

function mapItinerary(node: ItineraryWire): Itinerary {
  return {
    start: node.start ?? null,
    end: node.end ?? null,
    durationSeconds: node.duration ?? 0,
    waitingTimeSeconds: node.waitingTime ?? null,
    numberOfTransfers: node.numberOfTransfers,
    accessibilityScore: node.accessibilityScore ?? null,
    legs: node.legs.map(mapLeg),
  };
}

function mapLeg(leg: LegWire): Leg {
  return {
    mode: transitModeFromWire(leg.mode),
    startScheduled: leg.start.scheduledTime,
    endScheduled: leg.end.scheduledTime,
    startEstimated: leg.start.estimated?.time ?? null,
    endEstimated: leg.end.estimated?.time ?? null,
    startDelaySeconds: durationSecondsFromWire(leg.start.estimated?.delay),
    endDelaySeconds: durationSecondsFromWire(leg.end.estimated?.delay),
    isRealtime: leg.realTime ?? false,
    realtimeState: leg.realtimeState ?? null,
    serviceDate: leg.serviceDate ?? null,
    fromName: leg.from.name ?? null,
    toName: leg.to.name ?? null,
    routeShortName: leg.route?.shortName ?? null,
    routeLongName: leg.route?.longName ?? null,
    headsign: leg.headsign ?? null,
    distanceMeters: leg.distance ?? null,
    durationSeconds: leg.duration ?? null,
    tripGtfsId: leg.trip?.gtfsId ?? null,
    bikesAllowed: bikesAllowedFromWire(leg.trip?.bikesAllowed),
    accessibilityScore: leg.accessibilityScore ?? null,
    fromWheelchair: wheelchairFromWire(leg.from.stop?.wheelchairBoarding),
    toWheelchair: wheelchairFromWire(leg.to.stop?.wheelchairBoarding),
    geometry: leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [],
  };
}

function mapDepartures(stop: DeparturesStopWire): Departure[] {
  const stopName = stop.name.trim().toLowerCase();
  const out: Departure[] = [];
  for (const st of stop.stoptimesWithoutPatterns ?? []) {
    const serviceDay = st.serviceDay;
    const scheduledOffset = st.scheduledDeparture;
    if (serviceDay == null || scheduledOffset == null) continue;
    if (st.headsign != null && st.headsign.trim().toLowerCase() === stopName) continue;
    const route = st.trip?.route;
    out.push({
      scheduledTimeEpochMs: (serviceDay + scheduledOffset) * 1000,
      realtimeTimeEpochMs: st.realtimeDeparture != null ? (serviceDay + st.realtimeDeparture) * 1000 : null,
      isRealtime: st.realtime ?? false,
      realtimeState: st.realtimeState ?? null,
      headsign: st.headsign ?? null,
      tripGtfsId: st.trip?.gtfsId ?? null,
      routeShortName: route?.shortName ?? null,
      routeLongName: route?.longName ?? null,
      mode: transitModeFromWire(route?.mode),
    });
  }
  return out;
}

function mapTrip(trip: TripTripWire): TripDetails {
  const stops: TripStop[] = [];
  for (const st of trip.stoptimesForDate ?? []) {
    const s = st.stop;
    if (s == null) continue;
    const day = st.serviceDay;
    const at = (offset: number | null | undefined): number | null =>
      offset != null && day != null ? (day + offset) * 1000 : null;
    stops.push({
      gtfsId: s.gtfsId,
      name: s.name,
      lat: s.lat ?? null,
      lon: s.lon ?? null,
      scheduledArrivalEpochMs: at(st.scheduledArrival),
      scheduledDepartureEpochMs: at(st.scheduledDeparture),
      realtimeArrivalEpochMs: at(st.realtimeArrival),
      realtimeDepartureEpochMs: at(st.realtimeDeparture),
      isRealtime: st.realtime ?? false,
      wheelchairBoarding: wheelchairFromWire(s.wheelchairBoarding),
    });
  }
  return {
    gtfsId: trip.gtfsId,
    routeShortName: trip.route.shortName ?? null,
    routeLongName: trip.route.longName ?? null,
    mode: transitModeFromWire(trip.route.mode),
    headsign: trip.tripHeadsign ?? null,
    directionId: trip.directionId ?? null,
    bikesAllowed: bikesAllowedFromWire(trip.bikesAllowed),
    stops,
    geometry: trip.tripGeometry?.points ? decodePolyline(trip.tripGeometry.points) : [],
  };
}
