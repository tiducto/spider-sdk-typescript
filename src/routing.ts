import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import { SpiderContractMismatchError, TransportError, toSpiderError } from './errors.ts';
import type { BikesAllowed, TransitMode, WheelchairBoarding } from './enums.ts';
import { bikesAllowedFromWire, transitModeFromWire, wheelchairFromWire } from './enums.ts';
import type { Location, ViaLocation } from './location.ts';
import { decodePolyline } from './polyline.ts';
import { DEPARTURES, PLAN, TRIP } from './persistedQueries.ts';
import type {
  PlanConnectionData as PlanConnectionDataWire,
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
  readonly first?: number;
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
export interface PlanStreamOptions extends Omit<PlanOptions, 'first'> {
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

export interface DeparturesOptions {
  readonly startTime?: number | Date;
  readonly timeRangeSeconds?: number;
}

const DEFAULT_FIRST = 5;
const DEFAULT_SEARCH_WINDOW_MINUTES = 60;
const DEFAULT_MAX_TRAVERSAL_MINUTES = 360;
const DEFAULT_TARGET_RESULTS = 10;
// High per-step cap so each step pulls a whole window (OTP's cursor then advances a full window). `first` is
// a per-search cap, not cursor-locked, so it can be high without changing the step size.
const MAX_RESULTS_PER_STEP = 50;
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
    return this.page(request, options.first ?? DEFAULT_FIRST);
  }

  async planNext(route: Route, first: number = DEFAULT_FIRST): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasNextPage) return null;
    // Forward paging = first + after.
    return this.page(requestOf(route), first, undefined, undefined, route.pageInfo.endCursor ?? undefined);
  }

  async planPrevious(route: Route, last: number = DEFAULT_FIRST): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasPreviousPage) return null;
    // Backward paging = last + before (Relay-correct), not first + before.
    return this.page(requestOf(route), undefined, last, route.pageInfo.startCursor ?? undefined, undefined);
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
    const first = await this.plan({ ...planOptions, first: MAX_RESULTS_PER_STEP });
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
        ? await this.planNext(prev, MAX_RESULTS_PER_STEP)
        : await this.planPrevious(prev, MAX_RESULTS_PER_STEP);
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
    first?: number,
    last?: number,
    before?: string,
    after?: string,
  ): Promise<SpiderResult<Route>> {
    try {
      return success(await this.fetchPlan(request, first, last, before, after));
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  private async fetchPlan(
    request: PlanRequest,
    first?: number,
    last?: number,
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
      first,
      last,
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

function preferencesInput(request: PlanRequest): PlanPreferencesInput | undefined {
  const transit = request.maxTransfers != null
    ? { transfer: { maximumTransfers: request.maxTransfers } }
    : undefined;
  const accessibility = request.wheelchairAccessible ? { wheelchair: { enabled: true } } : undefined;
  if (transit === undefined && accessibility === undefined) return undefined;
  return { transit, accessibility };
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
