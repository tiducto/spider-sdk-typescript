import type { Transport } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import { SpiderContractMismatchError, TransportError, toSpiderError } from './errors.ts';
import type { BikesAllowed, TransitMode, WheelchairBoarding } from './enums.ts';
import { bikesAllowedFromWire, transitModeFromWire, wheelchairFromWire } from './enums.ts';
import type { Location, ViaLocation } from './location.ts';
import { decodePolyline } from './polyline.ts';

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
  readonly code: string;
  readonly description: string;
  readonly inputField: string | null;
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
  readonly realtimeState: string | null;
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
}

export interface DeparturesOptions {
  readonly startTime?: number | Date;
  readonly timeRangeSeconds?: number;
}

const DEFAULT_FIRST = 5;
const DEFAULT_TIME_RANGE_SECONDS = 24 * 60 * 60;
const INT_MAX = 2_147_483_647;

const PLAN = { id: 'f19608964d423831b485ccc878cb25eff56c720585d4423ee617c864e2b3102e', path: 'plan' };
const DEPARTURES = { id: '70a644fe3c6b2cbf5b2d70cef8230c1428bea6357ae1766772162d86469563d0', path: 'departures' };
const TRIP = { id: 'e8959a8d47a8e8437ee3ec740cd9c3e28bd401efdd236dde0502559daea53920', path: 'trip' };

interface RouteTimeSpec {
  readonly kind: 'departAt' | 'arriveBy';
  readonly epochMs: number;
}

interface RouteRequest {
  readonly origin: Location;
  readonly destination: Location;
  readonly time: RouteTimeSpec;
  readonly via: readonly ViaLocation[];
}

const ROUTE_REQUEST = Symbol('spider.routeRequest');
type RouteWithRequest = Route & { readonly [ROUTE_REQUEST]: RouteRequest };

export class SpiderRouting {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async plan(options: PlanOptions): Promise<SpiderResult<Route>> {
    const time: RouteTimeSpec = options.arriveBy != null
      ? { kind: 'arriveBy', epochMs: toEpochMs(options.arriveBy) }
      : { kind: 'departAt', epochMs: toEpochMs(options.departAt ?? Date.now()) };
    const request: RouteRequest = {
      origin: options.origin,
      destination: options.destination,
      time,
      via: options.via ?? [],
    };
    return this.page(request, options.first ?? DEFAULT_FIRST);
  }

  async nextPage(route: Route, first: number = DEFAULT_FIRST): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasNextPage) return null;
    return this.page(requestOf(route), first, undefined, route.pageInfo.endCursor ?? undefined);
  }

  async previousPage(route: Route, first: number = DEFAULT_FIRST): Promise<SpiderResult<Route> | null> {
    if (!route.pageInfo.hasPreviousPage) return null;
    return this.page(requestOf(route), first, route.pageInfo.startCursor ?? undefined, undefined);
  }

  async departures(
    stopId: string,
    numberOfDepartures = 30,
    options?: DeparturesOptions,
  ): Promise<SpiderResult<Departure[]>> {
    try {
      const variables = {
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
      const data = await this.transport.graphql<TripDataWire>(TRIP, { id: tripId, serviceDate });
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
    request: RouteRequest,
    first?: number,
    before?: string,
    after?: string,
  ): Promise<SpiderResult<Route>> {
    try {
      return success(await this.fetchPlan(request, first, before, after));
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  private async fetchPlan(
    request: RouteRequest,
    first?: number,
    before?: string,
    after?: string,
  ): Promise<Route> {
    const iso = new Date(request.time.epochMs).toISOString();
    const dateTime = request.time.kind === 'departAt'
      ? { earliestDeparture: iso }
      : { latestArrival: iso };
    const variables = {
      dateTime,
      origin: locationToInput(request.origin),
      destination: locationToInput(request.destination),
      via: request.via.length > 0 ? request.via.map(viaToInput) : undefined,
      first,
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

function requestOf(route: Route): RouteRequest {
  return (route as RouteWithRequest)[ROUTE_REQUEST];
}

function toEpochMs(value: number | Date): number {
  return typeof value === 'number' ? value : value.getTime();
}

function clampSeconds(seconds: number): number {
  return Math.max(0, Math.min(Math.floor(seconds), INT_MAX));
}

interface LabeledLocationInput {
  location: { coordinate?: { latitude: number; longitude: number }; stopLocation?: { stopLocationId: string } };
}

function locationToInput(location: Location): LabeledLocationInput {
  if (location.kind === 'stop') {
    return { location: { stopLocation: { stopLocationId: location.id } } };
  }
  return { location: { coordinate: { latitude: location.latitude, longitude: location.longitude } } };
}

interface ViaInput {
  passThrough?: { stopLocationIds: readonly string[] };
  visit?: {
    coordinate?: { latitude: number; longitude: number };
    stopLocationIds?: readonly string[];
    minimumWaitTime?: string;
  };
}

function viaToInput(via: ViaLocation): ViaInput {
  if (via.kind === 'passThrough') {
    return { passThrough: { stopLocationIds: via.stopIds } };
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

function mapDepartures(stop: StopWire): Departure[] {
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

interface PlanConnectionDataWire {
  planConnection?: PlanConnectionWire | null;
}

interface PlanConnectionWire {
  pageInfo: PlanPageInfoWire;
  routingErrors: RoutingErrorWire[];
  edges?: PlanEdgeWire[] | null;
  searchDateTime?: string | null;
}

interface PlanEdgeWire {
  cursor: string;
  node: ItineraryWire;
}

interface ItineraryWire {
  numberOfTransfers: number;
  legs: LegWire[];
  start?: string | null;
  end?: string | null;
  duration?: number | null;
  waitingTime?: number | null;
  accessibilityScore?: number | null;
}

interface LegWire {
  start: { scheduledTime: string };
  end: { scheduledTime: string };
  from: PlaceWire;
  to: PlaceWire;
  mode?: string | null;
  route?: RouteWire | null;
  headsign?: string | null;
  distance?: number | null;
  duration?: number | null;
  accessibilityScore?: number | null;
  trip?: { gtfsId: string; bikesAllowed?: string | null } | null;
  legGeometry?: { points?: string | null } | null;
}

interface PlaceWire {
  name?: string | null;
  stop?: { wheelchairBoarding?: string | null } | null;
}

interface RouteWire {
  shortName?: string | null;
  longName?: string | null;
  mode?: string | null;
}

interface PlanPageInfoWire {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string | null;
  endCursor?: string | null;
  searchWindowUsed?: string | null;
}

interface RoutingErrorWire {
  code: string;
  description: string;
  inputField?: string | null;
}

interface StopDeparturesDataWire {
  asStop?: StopWire | null;
  asStation?: StopWire | null;
}

interface StopWire {
  gtfsId: string;
  name: string;
  wheelchairBoarding?: string | null;
  stoptimesWithoutPatterns?: StoptimeWire[] | null;
}

interface StoptimeWire {
  serviceDay?: number | null;
  scheduledDeparture?: number | null;
  realtimeDeparture?: number | null;
  realtime?: boolean | null;
  realtimeState?: string | null;
  headsign?: string | null;
  trip?: { gtfsId: string; bikesAllowed?: string | null; route?: RouteWire | null } | null;
}

interface TripDataWire {
  trip?: TripTripWire | null;
}

interface TripTripWire {
  gtfsId: string;
  route: RouteWire;
  directionId?: string | null;
  tripHeadsign?: string | null;
  bikesAllowed?: string | null;
  stoptimesForDate?: TripStoptimeWire[] | null;
  tripGeometry?: { points?: string | null } | null;
}

interface TripStoptimeWire {
  serviceDay?: number | null;
  scheduledArrival?: number | null;
  scheduledDeparture?: number | null;
  realtimeArrival?: number | null;
  realtimeDeparture?: number | null;
  realtime?: boolean | null;
  realtimeState?: string | null;
  stop?: { gtfsId: string; name: string; lat?: number | null; lon?: number | null; wheelchairBoarding?: string | null } | null;
}
