import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import type { SpiderError } from './errors.ts';
import { DecodingError, TransportError, badRequest, httpFailure, toSpiderError } from './errors.ts';
import type { BikesAllowed, InputField, PickupDropoffType, RealtimeState, Reliability, RoutingErrorCode, TransitMode, WheelchairBoarding } from './enums.ts';
import {
  bikesAllowedFromWire,
  inputFieldFromWire,
  pickupDropoffTypeFromWire,
  realtimeStateFromWire,
  routingErrorCodeFromWire,
  transitModeFromWire,
  wheelchairFromWire,
} from './enums.ts';
import type { Location, ViaLocation } from './location.ts';
import { decodePolyline } from './polyline.ts';
import { invalidServiceDate, invalidStartTime, startTimeOrUndefined } from './serviceDate.ts';
import type {
  DepartureBoard,
  DeparturesRequest,
  DeparturesResponse,
  EstimatedDelay,
  EstimatedDelaysResponse,
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
  TransitFilterInput,
  TransitFilterSelectInput,
  TransitMode as WireTransitMode,
  TripRequest,
  TripResponse,
  TripTimetable,
  TripVehicle as TripVehicleWire,
} from './contract/routing/index.ts';

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/**
 * The vehicle running a trip run, as the realtime trip update names it, with its features: the same vehicle on a
 * {@link Leg}, a {@link Departure}, a {@link TripDetails} and a realtime `TripUpdate`. `id` is feed-prefixed
 * (`<feedId>:<id>`), the same string as `LiveVehicle.vehicleId`.
 */
export interface TripVehicle {
  /** Null when the feed gives none. */
  readonly id: string | null;
  /** The vehicle's user-visible label; null when the feed gives none. */
  readonly label: string | null;
  /** Whether the vehicle takes a wheelchair, its realtime access rather than the timetable's; null when unknown. */
  readonly wheelchairAccessible: WheelchairBoarding | null;
  /** Whether the vehicle is air-conditioned; null when unknown. */
  readonly airConditioning: boolean | null;
  /** Whether the vehicle offers Wi-Fi; null when unknown. */
  readonly wifi: boolean | null;
  /** Whether the vehicle accepts card payment on board; null when unknown. */
  readonly cardPayment: boolean | null;
}

export interface Leg {
  readonly mode: TransitMode;
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
  /** The realtime state of the leg's trip; `SCHEDULED` on a walk leg. */
  readonly realtimeState: RealtimeState;
  /** GTFS service date this leg's trip runs on (ISO `YYYY-MM-DD`) — pass it to {@link SpiderRouting.trip}, {@link SpiderRouting.estimatedDelays} and realtime `tripUpdates` and `vehicles`; null on a walk leg. */
  readonly serviceDate: string | null;
  /** The stop's name; `Origin` or `Destination` for a coordinate. */
  readonly fromName: string;
  readonly toName: string;
  /** Stop ids of the leg's endpoints; null for a coordinate endpoint. */
  readonly fromGtfsId: string | null;
  readonly toGtfsId: string | null;
  /** Positions of the leg's boarding and alighting stops in its trip: the {@link TripStop} of {@link SpiderRouting.trip} with the same `stopPosition` is that stop. Null on a walk leg. */
  readonly fromStopPosition: number | null;
  readonly toStopPosition: number | null;
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
  /** Null on a walk leg and when the feed has none. */
  readonly headsign: string | null;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly tripGtfsId: string | null;
  /** True when the rider stays on board from the previous leg as the vehicle continues as another trip; not counted as a transfer. */
  readonly interlineWithPreviousLeg: boolean;
  /** How the rider boards at the leg's `from` stop; `COORDINATE_WITH_DRIVER` is a stop on request. `SCHEDULED` on a walk leg and on an interlined leg, where the rider is already on board. */
  readonly pickupType: PickupDropoffType;
  /** How the rider alights at the leg's `to` stop; `COORDINATE_WITH_DRIVER` is a stop on request. `SCHEDULED` on a walk leg and when the next leg is interlined, where the rider stays on board. */
  readonly dropoffType: PickupDropoffType;
  readonly bikesAllowed: BikesAllowed | null;
  /** @deprecated Always null. */
  readonly accessibilityScore: number | null;
  readonly fromWheelchair: WheelchairBoarding | null;
  readonly toWheelchair: WheelchairBoarding | null;
  readonly geometry: readonly LatLon[];
  /** The vehicle running the leg's trip run; null on a walk leg and until a vehicle is matched to the run. */
  readonly vehicle: TripVehicle | null;
}

export interface Itinerary {
  readonly start: string;
  readonly end: string;
  readonly durationSeconds: number;
  readonly waitingTimeSeconds: number;
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
   * (destination) or `VIA` (a via stop id the environment doesn't know), or `FROM` or `TO` for a coordinate with no
   * street near enough to link to. An `OUTSIDE_BOUNDS` names `FROM` or `TO` (a coordinate outside the area the
   * router covers), `NO_STOPS_IN_RANGE` `FROM` or `TO`, and `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW` and
   * `OUTSIDE_SERVICE_PERIOD` `DATE_TIME`. `NO_TRANSIT_CONNECTION`, `WALKING_BETTER_THAN_TRANSIT` and
   * `NO_DIRECT_MODE_CONNECTION` name none.
   */
  readonly inputField: InputField | null;
}

export interface Route {
  readonly edges: readonly RouteEdge[];
  readonly pageInfo: RoutePageInfo;
  /** Why the plan was declined or kept no transit itinerary in the window; empty otherwise. */
  readonly routingErrors: readonly RoutingError[];
  readonly searchDateTime: string;
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
      /** Why the plan was declined or kept no transit itinerary in the swept window, mirroring {@link Route.routingErrors}; empty otherwise. */
      readonly routingErrors: readonly RoutingError[];
    }
  | {
      /** Terminal: invalid input, an HTTP or transport failure (a stream cut before `pageInfo` is `network`), or decoding. */
      readonly type: 'failure';
      readonly error: SpiderError;
    };

export interface Departure {
  readonly scheduledTimeEpochMs: number;
  /** The realtime-adjusted departure; the scheduled one when the trip has no realtime. */
  readonly realtimeTimeEpochMs: number;
  readonly isRealtime: boolean;
  readonly realtimeState: RealtimeState;
  /** Typical delay in seconds at this stop at the requested `reliability`; null when no reliability is passed, the trip has live realtime, or there is no history. */
  readonly typicalDelaySeconds: number | null;
  readonly headsign: string | null;
  readonly tripGtfsId: string;
  /** GTFS service date the trip runs on (ISO `YYYY-MM-DD`) — pass it to {@link SpiderRouting.trip}, {@link SpiderRouting.estimatedDelays} and realtime `tripUpdates` and `vehicles`. */
  readonly serviceDate: string;
  readonly routeGtfsId: string;
  readonly routeShortName: string | null;
  readonly routeLongName: string | null;
  /** Route colour as the feed gives it: GTFS hex without `#`, e.g. `FF0000`. */
  readonly routeColor: string | null;
  /** Route text colour as the feed gives it: GTFS hex without `#`, e.g. `FFFFFF`. */
  readonly routeTextColor: string | null;
  readonly mode: TransitMode;
  /** The stop this departure leaves from: the board's own stop, or one of a station's platforms. */
  readonly stopGtfsId: string;
  readonly platformCode: string | null;
  readonly wheelchairAccessible: WheelchairBoarding | null;
  /** The departure's position in its trip, as the trip's {@link TripStop.stopPosition}. */
  readonly stopPosition: number | null;
  /** How a rider boards here; `COORDINATE_WITH_DRIVER` is a stop on request. Never `NONE`: departures nobody can board are left out. */
  readonly pickupType: PickupDropoffType;
  /** How a rider alights here; `COORDINATE_WITH_DRIVER` is a stop on request. */
  readonly dropoffType: PickupDropoffType;
  /** The vehicle running the departure's trip run; null until a vehicle is matched to the run. */
  readonly vehicle: TripVehicle | null;
}

export interface TripStop {
  readonly gtfsId: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly scheduledArrivalEpochMs: number;
  readonly scheduledDepartureEpochMs: number;
  readonly realtimeArrivalEpochMs: number;
  readonly realtimeDepartureEpochMs: number;
  readonly isRealtime: boolean;
  /** Typical delay in seconds at this stop at the requested `reliability`; null when no reliability is passed, the trip has live realtime, or there is no history. */
  readonly typicalDelaySeconds: number | null;
  readonly wheelchairBoarding: WheelchairBoarding | null;
  readonly platformCode: string | null;
  readonly zoneId: string | null;
  /** The stop's position in the trip: increasing along it, not necessarily from 0 or consecutive. A leg's `fromStopPosition` or `toStopPosition`, or a departure's `stopPosition`, equal to it names this stop, also on a trip that visits one stop twice. Realtime that adds or removes stops can change it. */
  readonly stopPosition: number | null;
  /** Index into {@link TripDetails.geometry} of where the stop sits on the trip's line; null when the trip has no geometry or the stop has no point on it. */
  readonly geometryIndex: number | null;
  /** How a rider boards here; `COORDINATE_WITH_DRIVER` is a stop on request. Null when the stop is canceled: the trip is canceled or realtime skips the stop. */
  readonly pickupType: PickupDropoffType | null;
  /** How a rider alights here; `COORDINATE_WITH_DRIVER` is a stop on request. Null when the stop is canceled. */
  readonly dropoffType: PickupDropoffType | null;
}

export interface TripDetails {
  readonly gtfsId: string;
  /** GTFS service date of this trip run (ISO `YYYY-MM-DD`): the date it was requested for. */
  readonly serviceDate: string;
  readonly routeGtfsId: string;
  readonly routeShortName: string | null;
  readonly routeLongName: string | null;
  /** Route colour as the feed gives it: GTFS hex without `#`, e.g. `FF0000`. */
  readonly routeColor: string | null;
  /** Route text colour as the feed gives it: GTFS hex without `#`, e.g. `FFFFFF`. */
  readonly routeTextColor: string | null;
  readonly mode: TransitMode;
  readonly headsign: string | null;
  readonly directionId: string | null;
  readonly bikesAllowed: BikesAllowed | null;
  readonly wheelchairAccessible: WheelchairBoarding | null;
  readonly stops: readonly TripStop[];
  readonly geometry: readonly LatLon[];
  /** The vehicle running this trip run; null until a vehicle is matched to the run. */
  readonly vehicle: TripVehicle | null;
}

/**
 * Result of {@link SpiderRouting.estimatedDelays}: one stop's delay history, in seconds, per {@link Reliability} level.
 * History only, so live realtime never changes them, and they are present for a live trip whose `typicalDelaySeconds`
 * is null. For a trip without live realtime they equal {@link SpiderRouting.trip}'s `typicalDelaySeconds` at that
 * level wherever that is not null. A level with no shift is 0.
 */
export interface EstimatedDelays {
  readonly standardSeconds: number;
  readonly safeSeconds: number;
  readonly verySafeSeconds: number;
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
  /**
   * Plan for a wheelchair user: ride only trips the feed marks wheelchair accessible, board and alight only at stops
   * it marks accessible (no information counts as not accessible), and walk strongly avoiding steps and ways mapped
   * as not wheelchair accessible. The feed's accessibility data limits what this guarantees.
   */
  readonly wheelchairAccessible?: boolean;
  /** Plan arrivals with typical delays at this level. Undefined = plan on the timetable. */
  readonly reliability?: Reliability;
  /**
   * Never ride these transit modes; every other mode stays usable, including one the API adds later.
   * Undefined/empty = no filter; WALK/UNKNOWN drop out. Together with a non-empty `allowedTransitModes` it fails as
   * `bad_request` on `modes.transit` before any request.
   */
  readonly excludedTransitModes?: readonly TransitMode[];
  /** Tunes walking, transfers and boarding, and leaves out routes or agencies. Undefined = the environment's defaults. */
  readonly preferences?: RoutePreferences;
  /** Leave out every itinerary without a transit leg, such as walking the whole way. Default false. */
  readonly transitOnly?: boolean;
  /**
   * The most itineraries the page holds, from 1 up to the environment's itinerary limit; the API rejects a value out
   * of range, never clamps it. Undefined = that limit. {@link SpiderRouting.planNext} and
   * {@link SpiderRouting.planPrevious} keep it unless they are given another.
   */
  readonly numberOfItineraries?: number;
}

/**
 * Optional routing preferences for {@link SpiderRouting.plan} and {@link SpiderRouting.planStream}. Each member left
 * undefined keeps the environment's default, so `{}` asks for nothing. A value outside its range fails as
 * `bad_request` on the member's contract path (such as `preferences.street.walk.speed`) before any request; the API
 * never clamps one. The API rounds the multipliers and the walking speed to its own steps.
 */
export interface RoutePreferences {
  /** Walking speed on flat ground in metres per second, at least 0.1. */
  readonly walkSpeed?: number;
  /** How much worse walking is than riding for the same time, a multiplier from 0.1 to 100000: above the default it walks less. */
  readonly walkReluctance?: number;
  /** Generalized cost added for each boarding, an integer from 0 to 1000000: higher favours fewer rides. */
  readonly boardCost?: number;
  /** Generalized cost added for each transfer, an integer from 0 to 1000000: higher favours fewer transfers. */
  readonly transferCost?: number;
  /** Least time in seconds between alighting one vehicle and boarding the next, on top of the walk between the stops: 0 to 3600. */
  readonly transferSlackSeconds?: number;
  /** How much worse waiting at a stop is than riding for the same time, from 0.1 to 100000: above the default it rather walks on than waits. */
  readonly waitReluctance?: number;
  /** Least time in seconds at the stop before boarding: 0 to 3600. */
  readonly boardSlackSeconds?: number;
  /** Least time in seconds needed to alight: 0 to 3600. */
  readonly alightSlackSeconds?: number;
  /**
   * Leave out every trip of these feed-prefixed route ids (`<feedId>:<id>`, as {@link Leg.routeGtfsId} and
   * {@link Departure.routeGtfsId} give them). An id the environment's feed doesn't know excludes nothing, and
   * undefined/empty excludes nothing.
   */
  readonly excludedRoutes?: readonly string[];
  /** Leave out every trip of these feed-prefixed agency ids (`<feedId>:<id>`), as for `excludedRoutes`. */
  readonly excludedAgencies?: readonly string[];
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
  /** As {@link PlanOptions.excludedTransitModes}. */
  readonly excludedTransitModes?: readonly TransitMode[];
  /** As {@link PlanOptions.preferences}. A continuation must repeat it: its cursor carries only the time and the window. */
  readonly preferences?: RoutePreferences;
  /** As {@link PlanOptions.transitOnly}. A continuation must repeat it. */
  readonly transitOnly?: boolean;
}

export interface DeparturesOptions {
  /** Departures from this time on (default now). */
  readonly startTime?: number | Date;
  /** How far ahead to look, in seconds: above 0, up to 86400 (24 h, the default). */
  readonly timeRangeSeconds?: number;
  /** The level {@link Departure.typicalDelaySeconds} is given at. Undefined = none, and it is null. */
  readonly reliability?: Reliability;
  /**
   * Leave out departures of these modes. The API drops them before it counts `numberOfDepartures`, so the board,
   * and each later one paged by `startTime`, still holds up to that many departures of the other modes.
   * Undefined/empty = no filter; WALK/UNKNOWN drop out.
   */
  readonly excludedModes?: readonly TransitMode[];
}

const PLAN_PATH = '/routing/v1/plan';
const PLAN_STREAM_PATH = '/routing/v1/plan-stream';
const DEPARTURES_PATH = '/routing/v1/departures';
const TRIP_PATH = '/routing/v1/trip';
const ESTIMATED_DELAYS_PATH = '/routing/v1/estimated-delays';
const NO_CURSOR = 'NoCursor';

const DEFAULT_SEARCH_WINDOW_MINUTES = 60;
const DEFAULT_NUMBER_OF_DEPARTURES = 30;
const MAX_TIME_RANGE_SECONDS = 24 * 60 * 60;
// Fixed platform limits; the env-set ones (search window, result count, via count) are the server's to check.
const MIN_STREAM_WINDOW_MINUTES = 120;
const MAX_VIA_STOP_IDS = 10;
const MAX_VIA_WAIT_SECONDS = 60 * 60;
const WALK_PREFERENCES = 'preferences.street.walk';
const TRANSIT_PREFERENCES = 'preferences.transit';
const MIN_MULTIPLIER = 0.1;
const MAX_MULTIPLIER = 100_000;
const MAX_COST = 1_000_000;
const MAX_SLACK_SECONDS = 60 * 60;

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
  readonly excludedTransitModes: readonly TransitMode[];
  readonly preferences?: RoutePreferences;
  readonly transitOnly: boolean;
  readonly numberOfItineraries?: number;
}

const ROUTE_REQUEST = Symbol('spider.routeRequest');
type RouteWithRequest = Route & { readonly [ROUTE_REQUEST]: PlanRequest };

export class SpiderRouting {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /**
   * One page of itineraries. `preferences`, `transitOnly` and `numberOfItineraries` are kept with the route, so
   * {@link planNext} and {@link planPrevious} resend them with the mode filters.
   */
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
      excludedTransitModes: options.excludedTransitModes ?? [],
      preferences: options.preferences,
      transitOnly: options.transitOnly ?? false,
      numberOfItineraries: options.numberOfItineraries,
    };
    const invalid = invalidModes(request.allowedTransitModes, request.excludedTransitModes)
      ?? invalidVia(request.via)
      ?? invalidPreferences(request.preferences);
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
      modes: modesInput(options.allowedTransitModes ?? [], options.excludedTransitModes ?? [], options.transitOnly ?? false),
      preferences: preferencesInput({
        maxTransfers: options.maxTransfers,
        wheelchairAccessible: options.wheelchairAccessible ?? false,
        preferences: options.preferences,
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

  /**
   * Plans the next window of itineraries (later departures); null when the page has no next one.
   * `numberOfItineraries` sizes this page as in {@link plan}: undefined keeps the size `route` was asked with, null
   * asks for the environment's limit, and the pages after this one keep what this one used.
   */
  async planNext(route: Route, numberOfItineraries?: number | null): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasNextPage) return null;
    return this.page(resized(requestOf(route), numberOfItineraries), cursorOf('after', route.pageInfo.endCursor));
  }

  /**
   * Plans the previous window of itineraries (earlier departures); null when the page has no previous one.
   * `numberOfItineraries` sizes this page as in {@link planNext}.
   */
  async planPrevious(route: Route, numberOfItineraries?: number | null): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasPreviousPage) return null;
    return this.page(resized(requestOf(route), numberOfItineraries), cursorOf('before', route.pageInfo.startCursor));
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
        reliability: options?.reliability,
        excludeModes: wireModesOrUndefined(options?.excludedModes ?? []),
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

  /**
   * One trip run: the trip on one service date (ISO `YYYY-MM-DD`, a {@link Leg.serviceDate} or
   * {@link Departure.serviceDate}). `reliability` is the level {@link TripStop.typicalDelaySeconds} is given at;
   * undefined = none, and it is null. `startTime` picks the run of a frequency-based trip by its start time, a GTFS
   * time `H:MM:SS` or `HH:MM:SS` (the realtime `startTime`); undefined or empty = the trip's first
   * run on `serviceDate`, and a time no run starts at is an unknown trip (`not_found`). A malformed date or start time
   * fails as `bad_request` without a request.
   */
  async trip(tripId: string, serviceDate: string, reliability?: Reliability, startTime?: string): Promise<SpiderResult<TripDetails>> {
    const invalid = invalidServiceDate(serviceDate) ?? invalidStartTime(startTime);
    if (invalid != null) return failure(invalid);
    try {
      const body: TripRequest = { id: tripId, serviceDate, startTime: startTimeOrUndefined(startTime), reliability };
      const trip = (await this.transport.postJson<TripResponse>(TRIP_PATH, body)).trip;
      if (trip == null) {
        throw new TransportError('no_data', `routing returned no trip for id=${tripId}`);
      }
      return success(mapTrip(trip, serviceDate));
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  /**
   * The delay history at one stop of one trip run: `serviceDate` as for {@link trip}, `stopPosition` a
   * {@link TripStop.stopPosition}. Null (a success) for an unknown trip, a stop position not on the trip, or no
   * history. `startTime` picks the run of a frequency-based trip, as for {@link trip}; a time no run starts at is null.
   * A malformed date or start time fails as `bad_request` without a request.
   */
  async estimatedDelays(
    tripId: string,
    serviceDate: string,
    stopPosition: number,
    startTime?: string,
  ): Promise<SpiderResult<EstimatedDelays | null>> {
    const invalid = invalidServiceDate(serviceDate) ?? invalidStartTime(startTime);
    if (invalid != null) return failure(invalid);
    const run = startTimeOrUndefined(startTime);
    try {
      const dto = await this.transport.getJson<EstimatedDelaysResponse>(ESTIMATED_DELAYS_PATH, {
        tripId,
        serviceDate,
        stopPosition: String(stopPosition),
        ...(run !== undefined ? { startTime: run } : {}),
      });
      return success(mapEstimatedDelays(dto));
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
      modes: modesInput(request.allowedTransitModes, request.excludedTransitModes, request.transitOnly),
      preferences: preferencesInput(request),
      searchWindow: `PT${Math.floor(request.searchWindowMinutes)}M`,
      first: cursor != null && 'before' in cursor ? undefined : request.numberOfItineraries,
      last: cursor != null && 'before' in cursor ? request.numberOfItineraries : undefined,
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
      searchDateTime: plan.searchDateTime,
    };
    return Object.assign({}, route, { [ROUTE_REQUEST]: request });
  }
}

function requestOf(route: Route): PlanRequest {
  return (route as RouteWithRequest)[ROUTE_REQUEST];
}

function resized(request: PlanRequest, numberOfItineraries: number | null | undefined): PlanRequest {
  return numberOfItineraries === undefined ? request : { ...request, numberOfItineraries: numberOfItineraries ?? undefined };
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
  return invalidModes(options.allowedTransitModes ?? [], options.excludedTransitModes ?? [])
    ?? invalidVia(options.via ?? [])
    ?? invalidPreferences(options.preferences);
}

// The API takes an allow-list or an exclude-list, never both non-empty: the same field and wording as its own 400.
function invalidModes(allowed: readonly TransitMode[], excluded: readonly TransitMode[]): SpiderError | null {
  return wireModes(allowed).length > 0 && wireModes(excluded).length > 0 ? badRequest('modes.transit', 'is invalid') : null;
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

function invalidPreferences(preferences: RoutePreferences | undefined): SpiderError | null {
  if (preferences == null) return null;
  const checks: [number | undefined, string, (value: number) => boolean][] = [
    [preferences.walkSpeed, `${WALK_PREFERENCES}.speed`, (v) => Number.isFinite(v) && v >= MIN_MULTIPLIER],
    [preferences.walkReluctance, `${WALK_PREFERENCES}.reluctance`, isMultiplier],
    [preferences.boardCost, `${WALK_PREFERENCES}.boardCost`, isCost],
    [preferences.transferCost, `${TRANSIT_PREFERENCES}.transfer.cost`, isCost],
    [preferences.transferSlackSeconds, `${TRANSIT_PREFERENCES}.transfer.slack`, isSlack],
    [preferences.waitReluctance, `${TRANSIT_PREFERENCES}.board.waitReluctance`, isMultiplier],
    [preferences.boardSlackSeconds, `${TRANSIT_PREFERENCES}.board.slack`, isSlack],
    [preferences.alightSlackSeconds, `${TRANSIT_PREFERENCES}.alight.slack`, isSlack],
  ];
  for (const [value, field, valid] of checks) {
    if (value != null && !valid(value)) return badRequest(field);
  }
  return null;
}

function isMultiplier(value: number): boolean {
  return value >= MIN_MULTIPLIER && value <= MAX_MULTIPLIER;
}

function isCost(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_COST;
}

function isSlack(seconds: number): boolean {
  return seconds >= 0 && seconds <= MAX_SLACK_SECONDS;
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
function modesInput(allowed: readonly TransitMode[], excluded: readonly TransitMode[], transitOnly: boolean): PlanModesInput | undefined {
  const transit = wireModesOrUndefined(allowed)?.map((mode) => ({ mode }));
  const exclude = wireModesOrUndefined(excluded);
  return compact({
    transitOnly: transitOnly ? true : undefined,
    transit: compact({ transit, exclude }),
  });
}

function wireModes(modes: readonly TransitMode[]): WireTransitMode[] {
  return modes.filter((m) => WIRE_TRANSIT_MODES.has(m)) as WireTransitMode[];
}

function wireModesOrUndefined(modes: readonly TransitMode[]): WireTransitMode[] | undefined {
  const wire = wireModes(modes);
  return wire.length > 0 ? wire : undefined;
}

function preferencesInput(request: {
  maxTransfers?: number;
  wheelchairAccessible: boolean;
  preferences?: RoutePreferences;
}): PlanPreferencesInput | undefined {
  const preferences = request.preferences ?? {};
  // The router indexes legs with leg 0 = the initial access (walk, or nothing), so its wire
  // `maximumTransfers` counts boardings = transfers + 1 (wire 0 = walk-only, not exposed here).
  // `maxTransfers` is a transfer count, so map it to boardings: 0 transfers = 1 boarding (direct).
  const transfer = compact({
    cost: preferences.transferCost,
    slack: slackToWire(preferences.transferSlackSeconds),
    maximumTransfers: request.maxTransfers != null ? request.maxTransfers + 1 : undefined,
  });
  const board = compact({
    waitReluctance: preferences.waitReluctance,
    slack: slackToWire(preferences.boardSlackSeconds),
  });
  const alight = compact({ slack: slackToWire(preferences.alightSlackSeconds) });
  const walk = compact({
    speed: preferences.walkSpeed,
    reluctance: preferences.walkReluctance,
    boardCost: preferences.boardCost,
  });
  return compact({
    street: compact({ walk }),
    transit: compact({ transfer, board, alight, filters: filtersInput(preferences) }),
    accessibility: request.wheelchairAccessible ? { wheelchair: { enabled: true } } : undefined,
  });
}

function filtersInput(preferences: RoutePreferences): TransitFilterInput[] | undefined {
  const exclude: TransitFilterSelectInput[] = [];
  if (preferences.excludedRoutes != null && preferences.excludedRoutes.length > 0) {
    exclude.push({ routes: [...preferences.excludedRoutes] });
  }
  if (preferences.excludedAgencies != null && preferences.excludedAgencies.length > 0) {
    exclude.push({ agencies: [...preferences.excludedAgencies] });
  }
  return exclude.length > 0 ? [{ exclude }] : undefined;
}

function slackToWire(seconds: number | undefined): string | undefined {
  return seconds != null ? `PT${seconds}S` : undefined;
}

function compact<T extends object>(value: T): T | undefined {
  return Object.values(value).some((v) => v !== undefined) ? value : undefined;
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
        itineraries: chunk.results.map(mapItinerary),
      }));
    case 'pageInfo':
      return decodeStreamRecord('pageInfo', data, (page: PlanStreamPageInfoEvent) => ({
        type: 'done',
        pageInfo: {
          startCursor: page.startCursor ?? null,
          endCursor: page.endCursor ?? null,
          hasNextPage: page.hasNextPage,
          hasPreviousPage: page.hasPreviousPage,
          searchWindowUsed: page.searchWindowUsed ?? null,
        },
        routingErrors: page.routingErrors.map(mapRoutingError),
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
  return {
    code: routingErrorCodeFromWire(re.code),
    description: re.description,
    inputField: inputFieldFromWire(re.inputField),
  };
}

function mapItinerary(node: ItineraryWire): Itinerary {
  return {
    start: node.start,
    end: node.end,
    durationSeconds: node.duration,
    waitingTimeSeconds: node.waitingTime,
    numberOfTransfers: node.numberOfTransfers,
    accessibilityScore: null,
    legs: node.legs.map(mapLeg),
  };
}

function mapLeg(leg: LegWire): Leg {
  const startEstimated = leg.start.estimated;
  const endEstimated = leg.end.estimated;
  const fromStop = leg.from.stop;
  const toStop = leg.to.stop;
  const route = leg.route;
  const trip = leg.trip;
  return {
    mode: transitModeFromWire(leg.mode),
    startScheduled: leg.start.scheduledTime,
    endScheduled: leg.end.scheduledTime,
    startEstimated: startEstimated?.time ?? null,
    endEstimated: endEstimated?.time ?? null,
    startDelaySeconds: durationSecondsFromWire(startEstimated?.delay),
    endDelaySeconds: durationSecondsFromWire(endEstimated?.delay),
    typicalArrivalDelaySeconds: leg.typicalArrivalDelay ?? null,
    isRealtime: leg.realTime,
    realtimeState: realtimeStateFromWire(leg.realtimeState),
    serviceDate: leg.serviceDate ?? null,
    fromName: leg.from.name,
    toName: leg.to.name,
    fromGtfsId: fromStop?.gtfsId ?? null,
    toGtfsId: toStop?.gtfsId ?? null,
    fromStopPosition: leg.from.stopPosition ?? null,
    toStopPosition: leg.to.stopPosition ?? null,
    fromPlatformCode: fromStop?.platformCode ?? null,
    toPlatformCode: toStop?.platformCode ?? null,
    fromZoneId: fromStop?.zoneId ?? null,
    toZoneId: toStop?.zoneId ?? null,
    routeGtfsId: route?.gtfsId ?? null,
    routeShortName: route?.shortName ?? null,
    routeLongName: route?.longName ?? null,
    routeColor: route?.color ?? null,
    routeTextColor: route?.textColor ?? null,
    headsign: leg.headsign ?? null,
    distanceMeters: leg.distance,
    durationSeconds: leg.duration,
    tripGtfsId: trip?.gtfsId ?? null,
    interlineWithPreviousLeg: leg.interlineWithPreviousLeg,
    pickupType: pickupDropoffTypeFromWire(leg.pickupType),
    dropoffType: pickupDropoffTypeFromWire(leg.dropoffType),
    bikesAllowed: bikesAllowedFromWire(trip?.bikesAllowed),
    accessibilityScore: null,
    fromWheelchair: wheelchairFromWire(fromStop?.wheelchairBoarding),
    toWheelchair: wheelchairFromWire(toStop?.wheelchairBoarding),
    geometry: decodePolyline(leg.legGeometry.points),
    vehicle: mapTripVehicle(leg.vehicle),
  };
}

function mapTripVehicle(v: TripVehicleWire | null | undefined): TripVehicle | null {
  if (v == null) return null;
  return {
    id: v.id ?? null,
    label: v.label ?? null,
    wheelchairAccessible: wheelchairFromWire(v.wheelchairAccessible),
    airConditioning: v.airConditioning ?? null,
    wifi: v.wifi ?? null,
    cardPayment: v.cardPayment ?? null,
  };
}

function mapDepartures(stop: DepartureBoard): Departure[] {
  return stop.stoptimesWithoutPatterns.map((st) => {
    const route = st.trip.route;
    return {
      scheduledTimeEpochMs: (st.serviceDay + st.scheduledDeparture) * 1000,
      realtimeTimeEpochMs: (st.serviceDay + st.realtimeDeparture) * 1000,
      isRealtime: st.realtime,
      realtimeState: realtimeStateFromWire(st.realtimeState),
      typicalDelaySeconds: st.typicalDelay ?? null,
      headsign: st.headsign ?? null,
      tripGtfsId: st.trip.gtfsId,
      serviceDate: st.serviceDate,
      routeGtfsId: route.gtfsId,
      routeShortName: route.shortName ?? null,
      routeLongName: route.longName ?? null,
      routeColor: route.color ?? null,
      routeTextColor: route.textColor ?? null,
      mode: transitModeFromWire(route.mode),
      stopGtfsId: st.stop.gtfsId,
      platformCode: st.stop.platformCode ?? null,
      wheelchairAccessible: wheelchairFromWire(st.trip.wheelchairAccessible),
      stopPosition: st.stopPosition ?? null,
      pickupType: pickupDropoffTypeFromWire(st.pickupType),
      dropoffType: pickupDropoffTypeFromWire(st.dropoffType),
      vehicle: mapTripVehicle(st.vehicle),
    };
  });
}

function mapTrip(trip: TripTimetable, serviceDate: string): TripDetails {
  const geometry = trip.tripGeometry;
  const stops: TripStop[] = trip.stoptimesForDate.map((st) => {
    const s = st.stop;
    const at = (offset: number): number => (st.serviceDay + offset) * 1000;
    return {
      gtfsId: s.gtfsId,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      scheduledArrivalEpochMs: at(st.scheduledArrival),
      scheduledDepartureEpochMs: at(st.scheduledDeparture),
      realtimeArrivalEpochMs: at(st.realtimeArrival),
      realtimeDepartureEpochMs: at(st.realtimeDeparture),
      isRealtime: st.realtime,
      typicalDelaySeconds: st.typicalDelay ?? null,
      wheelchairBoarding: wheelchairFromWire(s.wheelchairBoarding),
      platformCode: s.platformCode ?? null,
      zoneId: s.zoneId ?? null,
      stopPosition: st.stopPosition ?? null,
      geometryIndex: st.geometryIndex ?? null,
      pickupType: pickupDropoffTypeFromWire(st.pickupType),
      dropoffType: pickupDropoffTypeFromWire(st.dropoffType),
    };
  });
  return {
    gtfsId: trip.gtfsId,
    serviceDate,
    routeGtfsId: trip.route.gtfsId,
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
    geometry: geometry != null ? decodePolyline(geometry.points) : [],
    vehicle: mapTripVehicle(trip.vehicle),
  };
}

// Entries are keyed by their level, not their position; a missing level is a malformed body.
function mapEstimatedDelays(dto: EstimatedDelaysResponse): EstimatedDelays | null {
  const entries: unknown = dto.estimatedDelays;
  if (entries === null) return null;
  const at = (level: Reliability): number => {
    const delay = Array.isArray(entries) ? (entries as EstimatedDelay[]).find((e) => e?.reliability === level)?.delay : undefined;
    if (typeof delay !== 'number') throw new DecodingError(`failed to decode GET ${ESTIMATED_DELAYS_PATH}: no ${level} delay`);
    return delay;
  };
  return { standardSeconds: at('STANDARD'), safeSeconds: at('SAFE'), verySafeSeconds: at('VERY_SAFE') };
}
