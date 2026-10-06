import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import type { SpiderError } from './errors.ts';
import { DecodingError, TransportError, badRequest, httpFailure, toSpiderError } from './errors.ts';
import type { BikesAllowed, InputField, RealtimeState, Reliability, RoutingErrorCode, TransitMode, WheelchairBoarding } from './enums.ts';
import {
  bikesAllowedFromWire,
  inputFieldFromWire,
  realtimeStateFromWire,
  routingErrorCodeFromWire,
  transitModeFromWire,
  wheelchairFromWire,
} from './enums.ts';
import type { Location, ViaLocation } from './location.ts';
import { decodePolyline } from './polyline.ts';
import { invalidServiceDate, serviceDateOf } from './serviceDate.ts';
import type {
  DepartureBoard,
  DeparturesRequest,
  DeparturesResponse,
  Itinerary as ItineraryWire,
  Leg as LegWire,
  PlanLabeledLocationInput,
  PlanModesInput,
  PlanPreferencesInput,
  PlanStreamChunkEvent,
  PlanStreamPageInfoEvent,
  PlanStreamRequest,
  PlanTripRequest,
  PlanTripResponse,
  PlanViaLocationInput,
  RoutingError as RoutingErrorWire,
  TransitMode as WireTransitMode,
  TripRequest,
  TripResponse,
  TripTimetable,
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
  /** Typical delay in seconds planned onto this leg's arrival at the requested `reliability`; null when none was requested or there is no history. */
  readonly typicalArrivalDelaySeconds: number | null;
  readonly isRealtime: boolean;
  readonly realtimeState: RealtimeState | null;
  /** GTFS service date this leg's trip runs on (ISO `YYYY-MM-DD`) — pass to realtime `delays` lookups. */
  readonly serviceDate: string | null;
  readonly fromName: string | null;
  readonly toName: string | null;
  /** Stop ids of the leg's endpoints; null for a coordinate endpoint. */
  readonly fromGtfsId: string | null;
  readonly toGtfsId: string | null;
  readonly fromPlatformCode: string | null;
  readonly toPlatformCode: string | null;
  readonly fromZoneId: string | null;
  readonly toZoneId: string | null;
  readonly routeGtfsId: string | null;
  readonly routeShortName: string | null;
  readonly routeLongName: string | null;
  /** Route colour as the feed gives it: GTFS hex without `#`, e.g. `FF0000`. */
  readonly routeColor: string | null;
  /** Route text colour as the feed gives it: GTFS hex without `#`, e.g. `FFFFFF`. */
  readonly routeTextColor: string | null;
  readonly headsign: string | null;
  readonly distanceMeters: number | null;
  readonly durationSeconds: number | null;
  readonly tripGtfsId: string | null;
  /** True when the rider stays on board from the previous leg as the vehicle continues as another trip; not counted as a transfer. */
  readonly interlineWithPreviousLeg: boolean;
  readonly bikesAllowed: BikesAllowed | null;
  /** @deprecated Always null. */
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
  /** @deprecated Always null. */
  readonly accessibilityScore: number | null;
  readonly legs: readonly Leg[];
}

export interface RouteEdge {
  /** @deprecated Always `'NoCursor'`; page with {@link Route.pageInfo}. */
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
  /**
   * The input the error is about, when there is one. A `LOCATION_NOT_FOUND` names `FROM` (origin), `TO`
   * (destination) or `VIA` (a via stop id the environment doesn't know).
   */
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
 * finalized itineraries as `result`s; a terminal `done` carries the continuation {@link RoutePageInfo}. A
 * `failure` is terminal and takes the place of the rest.
 */
export type PlanStreamEvent =
  | {
      /** A batch of finalized itineraries as the search frontier advances (with realtime delays on their legs). */
      readonly type: 'result';
      readonly itineraries: readonly Itinerary[];
    }
  | {
      /** Terminal: the continuation cursors, mirroring {@link Route.pageInfo}. Continue with
       * {@link SpiderRouting.planStreamNext} (`endCursor`) or {@link SpiderRouting.planStreamPrevious}
       * (`startCursor`), gated on `hasNextPage` / `hasPreviousPage`. */
      readonly type: 'done';
      readonly pageInfo: RoutePageInfo;
      /** Why the sweep found nothing, mirroring {@link Route.routingErrors}; empty when there is nothing to report. */
      readonly routingErrors: readonly RoutingError[];
    }
  | {
      /** Terminal: invalid input, an HTTP or transport failure (a stream cut before `pageInfo` is `network`), or decoding. */
      readonly type: 'failure';
      readonly error: SpiderError;
    };

export interface Departure {
  readonly scheduledTimeEpochMs: number;
  readonly realtimeTimeEpochMs: number | null;
  readonly isRealtime: boolean;
  readonly realtimeState: RealtimeState | null;
  /** Typical (median) delay in seconds at this stop for this trip on its service date's day type; null when there is no history. */
  readonly typicalDelaySeconds: number | null;
  readonly headsign: string | null;
  readonly tripGtfsId: string | null;
  /** GTFS service date the trip runs on (ISO `YYYY-MM-DD`) — pass it to {@link SpiderRouting.trip} and realtime `delays`. */
  readonly serviceDate: string;
  readonly routeGtfsId: string | null;
  readonly routeShortName: string | null;
  readonly routeLongName: string | null;
  /** Route colour as the feed gives it: GTFS hex without `#`, e.g. `FF0000`. */
  readonly routeColor: string | null;
  /** Route text colour as the feed gives it: GTFS hex without `#`, e.g. `FFFFFF`. */
  readonly routeTextColor: string | null;
  readonly mode: TransitMode | null;
  /** The stop this departure leaves from: the board's own stop, or one of a station's platforms. */
  readonly stopGtfsId: string | null;
  readonly platformCode: string | null;
  readonly wheelchairAccessible: WheelchairBoarding | null;
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
  /** Typical (median) delay in seconds at this stop for this trip on its service date's day type; null when there is no history. */
  readonly typicalDelaySeconds: number | null;
  readonly wheelchairBoarding: WheelchairBoarding | null;
  readonly platformCode: string | null;
  readonly zoneId: string | null;
}

export interface TripDetails {
  readonly gtfsId: string;
  /** GTFS service date of this trip instance (ISO `YYYY-MM-DD`); null when the trip has no stop times on it. */
  readonly serviceDate: string | null;
  readonly routeGtfsId: string | null;
  readonly routeShortName: string | null;
  readonly routeLongName: string | null;
  /** Route colour as the feed gives it: GTFS hex without `#`, e.g. `FF0000`. */
  readonly routeColor: string | null;
  /** Route text colour as the feed gives it: GTFS hex without `#`, e.g. `FFFFFF`. */
  readonly routeTextColor: string | null;
  readonly mode: TransitMode | null;
  readonly headsign: string | null;
  readonly directionId: string | null;
  readonly bikesAllowed: BikesAllowed | null;
  readonly wheelchairAccessible: WheelchairBoarding | null;
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
  /** Most transfers in any itinerary (0 = direct only), up to the environment's limit. Undefined = that limit. */
  readonly maxTransfers?: number;
  /**
   * Search window in minutes (default 60), up to the environment's limit. Always sent, deliberately not a
   * dynamic route-dependent window — predictable cost + paging. Widen for sparse/intercity routes.
   */
  readonly searchWindowMinutes?: number;
  /** Prefer wheelchair-accessible routing. */
  readonly wheelchairAccessible?: boolean;
  /** Plan arrivals with typical delays at this level. Undefined = plan on the timetable. */
  readonly reliability?: Reliability;
}

/**
 * Options for {@link SpiderRouting.planStream} and its continuations — the server-push SSE stream that opens one
 * long-lived Server-Sent Events request and pushes itineraries (with realtime delays) as the router sweeps the
 * window forward. The continuation methods take these same options plus a raw cursor string.
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
  /** Plan arrivals with typical delays at this level. Undefined = plan on the timetable. */
  readonly reliability?: Reliability;
  /**
   * Soft floor: the sweep keeps going until at least this many itineraries are found. From 1 up to the
   * environment's result count.
   */
  readonly targetResults: number;
  /**
   * How far the sweep may search, in minutes: at least 120 (2 h), up to the environment's search-window limit.
   * A smaller value fails as `bad_request` on `maxWindow` before any request.
   */
  readonly maxWindowMinutes: number;
}

export interface DeparturesOptions {
  /** Departures from this time on (default now). */
  readonly startTime?: number | Date;
  /** How far ahead to look, in seconds: above 0, up to 86400 (24 h, the default). */
  readonly timeRangeSeconds?: number;
}

const PLAN_PATH = '/routing/v1/plan';
const PLAN_STREAM_PATH = '/routing/v1/plan-stream';
const DEPARTURES_PATH = '/routing/v1/departures';
const TRIP_PATH = '/routing/v1/trip';
const NO_CURSOR = 'NoCursor';

const DEFAULT_SEARCH_WINDOW_MINUTES = 60;
const DEFAULT_NUMBER_OF_DEPARTURES = 30;
const MAX_TIME_RANGE_SECONDS = 24 * 60 * 60;
// Fixed platform limits; the env-set ones (search window, result count, via count) are the server's to check.
const MIN_STREAM_WINDOW_MINUTES = 120;
const MAX_VIA_STOP_IDS = 10;
const MAX_VIA_WAIT_SECONDS = 60 * 60;

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
  readonly reliability?: Reliability;
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
      reliability: options.reliability,
    };
    const invalid = invalidVia(request.via);
    if (invalid != null) return failure(invalid);
    return this.page(request);
  }

  /**
   * Streams itineraries over Server-Sent Events as the router sweeps the search window forward, emitting them
   * as they finalize instead of one batched page. Lazy and cancellable: iteration opens the request, and
   * `break`ing out of the `for await` cancels the underlying stream. Each `result` event carries itineraries
   * with realtime delays already on their legs; a terminal `done` event then carries the continuation
   * {@link RoutePageInfo} and any `routingErrors` (or a terminal `failure`). Never throws — transport, HTTP and
   * request errors surface as a `failure` event.
   *
   * `targetResults` (a soft floor the sweep aims to reach) and `maxWindowMinutes` (how far it may search, at
   * least 2 h) are required. This opens a fresh stream; to continue, call {@link planStreamNext} with
   * `done.pageInfo.endCursor` (when `hasNextPage`) or {@link planStreamPrevious} with `done.pageInfo.startCursor`
   * (when `hasPreviousPage`). For a single batched page instead, use {@link plan}.
   */
  async *planStream(options: PlanStreamRequestOptions): AsyncGenerator<PlanStreamEvent> {
    yield* this.openPlanStream(options);
  }

  /**
   * Continues a stream forward from a prior `done` event's `endCursor`. Takes the same options as
   * {@link planStream} (so `targetResults` / `maxWindowMinutes` can vary per continuation) plus the raw cursor.
   * Call only when the prior `done.pageInfo.hasNextPage` was true.
   */
  async *planStreamNext(options: PlanStreamRequestOptions, after: string): AsyncGenerator<PlanStreamEvent> {
    yield* this.openPlanStream(options, { after });
  }

  /**
   * Continues a stream backward from a prior `done` event's `startCursor`. Takes the same options as
   * {@link planStream} plus the raw cursor. Call only when the prior `done.pageInfo.hasPreviousPage` was true.
   */
  async *planStreamPrevious(options: PlanStreamRequestOptions, before: string): AsyncGenerator<PlanStreamEvent> {
    yield* this.openPlanStream(options, { before });
  }

  private streamBody(options: PlanStreamRequestOptions, cursor?: PageCursor): PlanStreamRequest {
    const time: RouteTimeSpec = options.arriveBy != null
      ? { kind: 'arriveBy', epochMs: toEpochMs(options.arriveBy) }
      : { kind: 'departAt', epochMs: toEpochMs(options.departAt ?? Date.now()) };
    const iso = new Date(time.epochMs).toISOString();
    const via = options.via ?? [];
    return {
      dateTime: time.kind === 'departAt' ? { earliestDeparture: iso } : { latestArrival: iso },
      origin: locationToInput(options.origin),
      destination: locationToInput(options.destination),
      via: via.length > 0 ? via.map(viaToInput) : undefined,
      modes: modesInput(options.allowedTransitModes ?? []),
      preferences: preferencesInput({
        maxTransfers: options.maxTransfers,
        wheelchairAccessible: options.wheelchairAccessible ?? false,
      }),
      targetResults: options.targetResults,
      maxWindow: `PT${Math.floor(options.maxWindowMinutes)}M`,
      reliability: options.reliability,
      ...cursor,
    };
  }

  // Never throws: every failure, a stream cut before its `pageInfo` included, is one terminal `failure` event.
  private async *openPlanStream(options: PlanStreamRequestOptions, cursor?: PageCursor): AsyncGenerator<PlanStreamEvent> {
    const invalid = invalidStreamOptions(options);
    if (invalid != null) {
      yield { type: 'failure', error: invalid };
      return;
    }
    let response: Response;
    try {
      response = await this.transport.stream(PLAN_STREAM_PATH, this.streamBody(options, cursor));
    } catch (e) {
      yield { type: 'failure', error: toSpiderError(e) };
      return;
    }
    if (!response.ok) {
      yield { type: 'failure', error: toSpiderError(httpFailure(`POST ${PLAN_STREAM_PATH}`, response.status, await drainText(response))) };
      return;
    }
    const body = response.body;
    if (body == null) {
      yield { type: 'failure', error: toSpiderError(new TransportError('no_data', 'routing plan-stream returned no body')) };
      return;
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawPageInfo = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        // A record still unterminated at close is discarded, per the SSE rules.
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const record = parseSseFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          const event = parsePlanStreamRecord(record.event, record.data);
          if (event == null) continue;
          yield event;
          if (event.type === 'failure') return;
          if (event.type === 'done') sawPageInfo = true;
        }
      }
      if (!sawPageInfo) yield { type: 'failure', error: { code: 'network', message: 'routing plan-stream ended before pageInfo' } };
    } catch (e) {
      if (!sawPageInfo) yield { type: 'failure', error: toSpiderError(e) };
    } finally {
      await reader.cancel().catch(() => {});
    }
  }

  async planNext(route: Route): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasNextPage) return null;
    // Forward paging = after (no count; the server returns a whole window per page).
    return this.page(requestOf(route), cursorOf('after', route.pageInfo.endCursor));
  }

  async planPrevious(route: Route): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasPreviousPage) return null;
    // Backward paging = before (no count; the server returns a whole window per page).
    return this.page(requestOf(route), cursorOf('before', route.pageInfo.startCursor));
  }

  /**
   * Upcoming departures from a stop or station: `numberOfDepartures` (default 30, up to the environment's
   * limit) within `options.timeRangeSeconds` (default 24 h) from `options.startTime` (default now).
   */
  async departures(
    stopId: string,
    numberOfDepartures = DEFAULT_NUMBER_OF_DEPARTURES,
    options?: DeparturesOptions,
  ): Promise<SpiderResult<Departure[]>> {
    const timeRange = Math.floor(options?.timeRangeSeconds ?? MAX_TIME_RANGE_SECONDS);
    if (!(timeRange > 0 && timeRange <= MAX_TIME_RANGE_SECONDS)) return failure(badRequest('timeRange'));
    try {
      const body: DeparturesRequest = {
        id: stopId,
        numberOfDepartures,
        startTime: options?.startTime != null ? Math.floor(toEpochMs(options.startTime) / 1000) : undefined,
        timeRange,
      };
      const stop = (await this.transport.postJson<DeparturesResponse>(DEPARTURES_PATH, body)).stop;
      if (stop == null) {
        throw new TransportError('no_data', `routing returned no stop or station for id=${stopId}`);
      }
      return success(mapDepartures(stop));
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  /** One trip on one service date (ISO `YYYY-MM-DD`, e.g. a {@link Departure.serviceDate}); undefined = today. */
  async trip(tripId: string, serviceDate?: string): Promise<SpiderResult<TripDetails>> {
    const invalid = serviceDate != null ? invalidServiceDate(serviceDate) : null;
    if (invalid != null) return failure(invalid);
    try {
      const body: TripRequest = { id: tripId, serviceDate };
      const trip = (await this.transport.postJson<TripResponse>(TRIP_PATH, body)).trip;
      if (trip == null) {
        throw new TransportError('no_data', `routing returned no trip for id=${tripId}`);
      }
      return success(mapTrip(trip));
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  private async page(request: PlanRequest, cursor?: PageCursor): Promise<SpiderResult<Route>> {
    try {
      return success(await this.fetchPlan(request, cursor));
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  private async fetchPlan(request: PlanRequest, cursor?: PageCursor): Promise<Route> {
    const iso = new Date(request.time.epochMs).toISOString();
    const dateTime = request.time.kind === 'departAt'
      ? { earliestDeparture: iso }
      : { latestArrival: iso };
    const body: PlanTripRequest = {
      dateTime,
      origin: locationToInput(request.origin),
      destination: locationToInput(request.destination),
      via: request.via.length > 0 ? request.via.map(viaToInput) : undefined,
      modes: modesInput(request.allowedTransitModes),
      preferences: preferencesInput(request),
      searchWindow: `PT${Math.floor(request.searchWindowMinutes)}M`,
      reliability: request.reliability,
      ...cursor,
    };
    const plan = await this.transport.postJson<PlanTripResponse>(PLAN_PATH, body);
    const route: Route = {
      edges: plan.itineraries.map((itinerary) => ({ cursor: NO_CURSOR, itinerary: mapItinerary(itinerary) })),
      pageInfo: {
        startCursor: plan.pageInfo.startCursor ?? null,
        endCursor: plan.pageInfo.endCursor ?? null,
        hasNextPage: plan.pageInfo.hasNextPage,
        hasPreviousPage: plan.pageInfo.hasPreviousPage,
        searchWindowUsed: plan.pageInfo.searchWindowUsed ?? null,
      },
      routingErrors: plan.routingErrors.map(mapRoutingError),
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

type PageCursor = { readonly after: string } | { readonly before: string };

function cursorOf(kind: 'after' | 'before', cursor: string | null): PageCursor | undefined {
  if (cursor == null) return undefined;
  return kind === 'after' ? { after: cursor } : { before: cursor };
}

function invalidStreamOptions(options: PlanStreamRequestOptions): SpiderError | null {
  // Required by the type; a plain-JS caller can still omit it, and `PTNaNM` must never reach the wire.
  if (options.maxWindowMinutes == null) return badRequest('maxWindow', 'is required');
  if (!(Math.floor(options.maxWindowMinutes) >= MIN_STREAM_WINDOW_MINUTES)) return badRequest('maxWindow');
  return invalidVia(options.via ?? []);
}

function invalidVia(via: readonly ViaLocation[]): SpiderError | null {
  for (const v of via) {
    if (v.kind === 'passThrough') {
      if (!(v.stopIds.length >= 1 && v.stopIds.length <= MAX_VIA_STOP_IDS)) return badRequest('via');
    } else if (!(v.minimumWaitSeconds >= 0 && v.minimumWaitSeconds <= MAX_VIA_WAIT_SECONDS)) {
      return badRequest('via.visit.minimumWaitTime');
    }
  }
  return null;
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
  if (via.location.kind !== 'stop') throw new TransportError('bad_request', 'via is invalid', undefined, undefined, 'via');
  const minimumWaitTime = via.minimumWaitSeconds > 0 ? `PT${via.minimumWaitSeconds}S` : undefined;
  return { visit: { stopLocationIds: [via.location.id], minimumWaitTime } };
}

// Curated PlanRequest → OTP's nested modes/preferences inputs. Only the exposed fields are set; everything
// else stays undefined so OTP applies its own defaults. Both return undefined when nothing is requested.
function modesInput(modes: readonly TransitMode[]): PlanModesInput | undefined {
  const transit = modes
    .filter((m) => WIRE_TRANSIT_MODES.has(m))
    .map((mode) => ({ mode: mode as WireTransitMode }));
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
// records the SDK doesn't surface (heartbeats, unknown events, the terminal `done` telemetry frame). A
// malformed payload becomes a terminal `failure` rather than throwing. Exported so the wire-contract test
// exercises it directly. A `chunk` frame → `result`; the `pageInfo` frame → terminal `done` (carrying the
// RoutePageInfo and routingErrors); the wire `done` telemetry frame just ends the stream and is dropped.
export function parsePlanStreamRecord(event: string, data: string): PlanStreamEvent | null {
  if (data.trim() === '') return null;
  switch (event) {
    case 'chunk':
      return decodeStreamRecord('chunk', data, (chunk: PlanStreamChunkEvent) => ({
        type: 'result',
        itineraries: (chunk.results ?? []).map(mapItinerary),
      }));
    case 'pageInfo':
      return decodeStreamRecord('pageInfo', data, (page: PlanStreamPageInfoEvent) => ({
        type: 'done',
        pageInfo: {
          startCursor: page.startCursor ?? null,
          endCursor: page.endCursor ?? null,
          hasNextPage: page.hasNextPage ?? false,
          hasPreviousPage: page.hasPreviousPage ?? false,
          searchWindowUsed: page.searchWindowUsed ?? null,
        },
        routingErrors: (page.routingErrors ?? []).map(mapRoutingError),
      }));
    default:
      return null;
  }
}

function decodeStreamRecord<W>(frame: string, data: string, map: (parsed: W) => PlanStreamEvent): PlanStreamEvent {
  try {
    return map(JSON.parse(data) as W);
  } catch (e) {
    return { type: 'failure', error: toSpiderError(new DecodingError(`failed to decode plan-stream ${frame}`, e)) };
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

async function drainText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function mapRoutingError(re: RoutingErrorWire): RoutingError {
  return { code: routingErrorCodeFromWire(re.code), description: re.description, inputField: inputFieldFromWire(re.inputField) };
}

function mapItinerary(node: ItineraryWire): Itinerary {
  return {
    start: node.start ?? null,
    end: node.end ?? null,
    durationSeconds: node.duration ?? 0,
    waitingTimeSeconds: node.waitingTime ?? null,
    numberOfTransfers: node.numberOfTransfers,
    accessibilityScore: null,
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
    typicalArrivalDelaySeconds: leg.typicalArrivalDelay ?? null,
    isRealtime: leg.realTime ?? false,
    realtimeState: realtimeStateFromWire(leg.realtimeState),
    serviceDate: leg.serviceDate ?? null,
    fromName: leg.from.name ?? null,
    toName: leg.to.name ?? null,
    fromGtfsId: leg.from.stop?.gtfsId ?? null,
    toGtfsId: leg.to.stop?.gtfsId ?? null,
    fromPlatformCode: leg.from.stop?.platformCode ?? null,
    toPlatformCode: leg.to.stop?.platformCode ?? null,
    fromZoneId: leg.from.stop?.zoneId ?? null,
    toZoneId: leg.to.stop?.zoneId ?? null,
    routeGtfsId: leg.route?.gtfsId ?? null,
    routeShortName: leg.route?.shortName ?? null,
    routeLongName: leg.route?.longName ?? null,
    routeColor: leg.route?.color ?? null,
    routeTextColor: leg.route?.textColor ?? null,
    headsign: leg.headsign ?? null,
    distanceMeters: leg.distance ?? null,
    durationSeconds: leg.duration ?? null,
    tripGtfsId: leg.trip?.gtfsId ?? null,
    interlineWithPreviousLeg: leg.interlineWithPreviousLeg ?? false,
    bikesAllowed: bikesAllowedFromWire(leg.trip?.bikesAllowed),
    accessibilityScore: null,
    fromWheelchair: wheelchairFromWire(leg.from.stop?.wheelchairBoarding),
    toWheelchair: wheelchairFromWire(leg.to.stop?.wheelchairBoarding),
    geometry: leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [],
  };
}

function mapDepartures(stop: DepartureBoard): Departure[] {
  const out: Departure[] = [];
  for (const st of stop.stoptimesWithoutPatterns ?? []) {
    const serviceDay = st.serviceDay;
    const scheduledOffset = st.scheduledDeparture;
    if (serviceDay == null || scheduledOffset == null) continue;
    const route = st.trip?.route;
    out.push({
      scheduledTimeEpochMs: (serviceDay + scheduledOffset) * 1000,
      realtimeTimeEpochMs: st.realtimeDeparture != null ? (serviceDay + st.realtimeDeparture) * 1000 : null,
      isRealtime: st.realtime ?? false,
      realtimeState: realtimeStateFromWire(st.realtimeState),
      typicalDelaySeconds: st.typicalDelay ?? null,
      headsign: st.headsign ?? null,
      tripGtfsId: st.trip?.gtfsId ?? null,
      serviceDate: serviceDateOf(serviceDay),
      routeGtfsId: route?.gtfsId ?? null,
      routeShortName: route?.shortName ?? null,
      routeLongName: route?.longName ?? null,
      routeColor: route?.color ?? null,
      routeTextColor: route?.textColor ?? null,
      mode: transitModeFromWire(route?.mode),
      stopGtfsId: st.stop?.gtfsId ?? null,
      platformCode: st.stop?.platformCode ?? null,
      wheelchairAccessible: wheelchairFromWire(st.trip?.wheelchairAccessible),
    });
  }
  return out;
}

function mapTrip(trip: TripTimetable): TripDetails {
  const serviceDay = trip.stoptimesForDate?.find((st) => st.serviceDay != null)?.serviceDay;
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
      typicalDelaySeconds: st.typicalDelay ?? null,
      wheelchairBoarding: wheelchairFromWire(s.wheelchairBoarding),
      platformCode: s.platformCode ?? null,
      zoneId: s.zoneId ?? null,
    });
  }
  return {
    gtfsId: trip.gtfsId,
    serviceDate: serviceDay != null ? serviceDateOf(serviceDay) : null,
    routeGtfsId: trip.route.gtfsId ?? null,
    routeShortName: trip.route.shortName ?? null,
    routeLongName: trip.route.longName ?? null,
    routeColor: trip.route.color ?? null,
    routeTextColor: trip.route.textColor ?? null,
    mode: transitModeFromWire(trip.route.mode),
    headsign: trip.tripHeadsign ?? null,
    directionId: trip.directionId ?? null,
    bikesAllowed: bikesAllowedFromWire(trip.bikesAllowed),
    wheelchairAccessible: wheelchairFromWire(trip.wheelchairAccessible),
    stops,
    geometry: trip.tripGeometry?.points ? decodePolyline(trip.tripGeometry.points) : [],
  };
}
