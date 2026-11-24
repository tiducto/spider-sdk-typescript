import type { Transport } from './http.ts';
import { parseJson } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import type { SpiderError } from './errors.ts';
import { badRequest, httpFailure, limitRefusal, toSpiderError } from './errors.ts';
import { invalidServiceDate, invalidStartTime, sameGtfsTime, startTimeOrUndefined } from './serviceDate.ts';
import type { OccupancyStatus, WheelchairBoarding } from './enums.ts';
import { occupancyFromWire, vehicleWheelchairFromWire } from './enums.ts';
import type { LatLon, TripVehicle } from './routing.ts';
import { decodePolyline } from './polyline.ts';

export interface FeedFreshness {
  readonly feedTimestampEpochMs: number | null;
  readonly staleSeconds: number | null;
}

/** A vehicle's live position and features. `tripId`, `routeId`, `stopId` and `vehicleId` are feed-prefixed (`<feedId>:<id>`). */
export interface LiveVehicle {
  readonly tripId: string;
  /** GTFS service date (ISO `YYYY-MM-DD`) of the trip run the vehicle is on. */
  readonly serviceDate: string;
  /**
   * Start time of the trip run, a GTFS time `HH:MM:SS` that may exceed `24:00:00`: it tells apart the runs of a
   * frequency-based trip. Null when the feed gives none.
   */
  readonly startTime: string | null;
  readonly routeId: string | null;
  readonly vehicleId: string | null;
  readonly label: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly bearing: number | null;
  readonly speed: number | null;
  readonly stopId: string | null;
  readonly currentStatus: string | null;
  readonly occupancy: OccupancyStatus | null;
  readonly timestampEpochMs: number | null;
  /** Whether the vehicle takes a wheelchair; null when the feed reports no value or `UNKNOWN`. */
  readonly wheelchairAccessible: WheelchairBoarding | null;
  /** Whether the vehicle is air-conditioned; null when unknown. */
  readonly airConditioning: boolean | null;
  /** Whether the vehicle offers Wi-Fi; null when unknown. */
  readonly wifi: boolean | null;
  /** Whether the vehicle accepts card payment on board; null when unknown. */
  readonly cardPayment: boolean | null;
}

export interface LiveVehicleUpdate {
  readonly vehicle: LiveVehicle | null;
  readonly freshness: FeedFreshness;
}

export interface VehiclePositions {
  readonly vehicles: readonly LiveVehicle[];
  readonly missing: readonly string[];
  readonly freshness: FeedFreshness;
}

export interface StopTimeUpdate {
  readonly stopId: string | null;
  readonly stopSequence: number | null;
  readonly arrivalDelay: number | null;
  readonly departureDelay: number | null;
  readonly scheduleRelationship: string | null;
}

/** A trip's live delay. `tripId` and `routeId` are feed-prefixed (`<feedId>:<id>`). */
export interface TripDelay {
  readonly tripId: string;
  readonly routeId: string | null;
  readonly delaySeconds: number | null;
  readonly scheduleRelationship: string | null;
  readonly stopTimeUpdates: readonly StopTimeUpdate[];
}

/** Result of {@link SpiderRealtime.delays}: the delays the feed reported for one service date, and the `missing` trip ids it didn't. Look one up with {@link delayFor}. */
export interface TripDelays {
  readonly serviceDate: string;
  readonly delays: readonly TripDelay[];
  readonly missing: readonly string[];
  readonly freshness: FeedFreshness;
}

/**
 * The delay for `tripId` on this service date, if the feed reported one; otherwise null.
 * @deprecated Use {@link SpiderRealtime.tripUpdates} and {@link tripUpdateFor}.
 */
export function delayFor(delays: TripDelays, tripId: string): TripDelay | null {
  return delays.delays.find((d) => d.tripId === tripId) ?? null;
}

/** An original stop time of the trip, by `stopSequence` and/or `stopId` as the feed gives it. Experimental. */
export interface StopSelector {
  readonly stopSequence: number | null;
  readonly stopId: string | null;
}

/**
 * A stop the trip visits in place of the replaced span. `name`, `latitude` and `longitude` are set only for a stop
 * the feed defines in realtime; otherwise the stop is a static one, which stop search returns. Experimental.
 */
export interface ReplacementStop {
  readonly stopId: string | null;
  /** Seconds from the arrival at the stop before {@link TripModification.startStop} (the trip's first stop when the modification starts there) to the arrival here. */
  readonly travelTimeToStopSeconds: number | null;
  readonly name: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/**
 * A detour, as a GTFS-RT `TripModifications.Modification`: a span of the trip's stop times replaced by
 * `replacementStops`. Experimental: GTFS-RT trip modifications are experimental, and this shape may change in a
 * minor release.
 */
export interface TripModification {
  /** Feed-prefixed id of the `FeedEntity` holding the modifications. */
  readonly id: string;
  /** The runs of a frequency-based trip it applies to, as GTFS times; null when it applies to every run on the service date. */
  readonly startTimes: readonly string[] | null;
  /** The first original stop time replaced. */
  readonly startStop: StopSelector | null;
  /** The last original stop time replaced, inclusive; null when no stop time is replaced. */
  readonly endStop: StopSelector | null;
  readonly replacementStops: readonly ReplacementStop[];
  /** Seconds added to every arrival and departure after the end of the modification. */
  readonly propagatedModificationDelaySeconds: number;
  /** Feed-prefixed id of the alert describing it, as {@link SpiderRealtime.alerts} returns it. */
  readonly alertId: string | null;
  readonly lastModifiedEpochMs: number | null;
  /** The modified trip's path; null when the feed has no realtime shape for it. */
  readonly shape: readonly LatLon[] | null;
}

/** A trip run's live update. `tripId` and `routeId` are feed-prefixed (`<feedId>:<id>`). */
export interface TripUpdate {
  readonly tripId: string;
  /**
   * Start time of the trip run, a GTFS time `HH:MM:SS` that may exceed `24:00:00`: each run of a frequency-based trip
   * is its own update. Null when the feed gives none.
   */
  readonly startTime: string | null;
  readonly routeId: string | null;
  /** Seconds, positive when late: the delay of the last stop-time update that carries one. Null when the updates give only absolute times. */
  readonly delaySeconds: number | null;
  readonly scheduleRelationship: string | null;
  readonly stopTimeUpdates: readonly StopTimeUpdate[];
  /** The trip modifications (detours) applying to this run, in feed order; their delays accumulate along the trip. Empty when none applies. Experimental. */
  readonly modifications: readonly TripModification[];
  /** The vehicle the update names running this run; null when it names none, as before a vehicle is on the run. */
  readonly vehicle: TripVehicle | null;
}

/** Result of {@link SpiderRealtime.tripUpdates}: the trip updates for one service date, and the `missing` trip ids with none. Look one up with {@link tripUpdateFor}. */
export interface TripUpdates {
  readonly serviceDate: string;
  readonly tripUpdates: readonly TripUpdate[];
  readonly missing: readonly string[];
  readonly freshness: FeedFreshness;
}

/**
 * The update for `tripId` on this service date, if there is one; otherwise null. `startTime` picks the run of a
 * frequency-based trip (`8:10:00` is `08:10:00`); undefined takes the trip's first update.
 */
export function tripUpdateFor(updates: TripUpdates, tripId: string, startTime?: string): TripUpdate | null {
  return updates.tripUpdates.find((u) => u.tripId === tripId
    && (startTime == null || (u.startTime != null && sameGtfsTime(u.startTime, startTime)))) ?? null;
}

export interface AlertActivePeriod {
  readonly startEpochMs: number | null;
  readonly endEpochMs: number | null;
}

export interface AlertInformedEntity {
  readonly agencyId: string | null;
  readonly routeId: string | null;
  readonly tripId: string | null;
  readonly stopId: string | null;
}

export interface ServiceAlert {
  readonly id: string;
  readonly cause: string | null;
  readonly effect: string | null;
  readonly severityLevel: string | null;
  readonly headerText: string | null;
  readonly descriptionText: string | null;
  readonly url: string | null;
  readonly activePeriods: readonly AlertActivePeriod[];
  readonly informedEntities: readonly AlertInformedEntity[];
}

export interface ServiceAlerts {
  readonly alerts: readonly ServiceAlert[];
  readonly freshness: FeedFreshness;
}

const EMPTY_FRESHNESS: FeedFreshness = { feedTimestampEpochMs: null, staleSeconds: null };
const EMPTY_POSITIONS: VehiclePositions = { vehicles: [], missing: [], freshness: EMPTY_FRESHNESS };
const MAX_TRIP_IDS = 50;

export class SpiderRealtime {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /**
   * Live positions for up to 50 feed-prefixed trip ids (`<feedId>:<id>`), sent untouched, running on one GTFS service
   * date (ISO `YYYY-MM-DD`, a plan leg's or departure's `serviceDate`): a vehicle is returned only while it runs that
   * trip run. Empty input skips the call; a malformed date or more than 50 ids fails as `bad_request` without a request.
   */
  async vehicles(serviceDate: string, tripIds: readonly string[]): Promise<SpiderResult<VehiclePositions>> {
    const invalid = invalidServiceDate(serviceDate);
    if (invalid != null) return failure(invalid);
    if (tripIds.length === 0) return success(EMPTY_POSITIONS);
    if (tripIds.length > MAX_TRIP_IDS) return failure(badRequest('tripIds'));
    try {
      const dto = await this.transport.getJson<VehiclesResponseWire>('/realtime/v1/vehicles', {
        serviceDate,
        tripIds: tripIds.join(','),
      });
      return success({
        vehicles: dto.vehicles.map(mapVehicle),
        missing: dto.missing,
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  /**
   * The live position of one trip run: a feed-prefixed trip id (`<feedId>:<id>`), sent untouched, on one GTFS service
   * date (ISO `YYYY-MM-DD`, a plan leg's or departure's `serviceDate`); `vehicle` is null when none reports.
   * `startTime` (a GTFS time `H:MM:SS` or `HH:MM:SS`, as {@link LiveVehicle.startTime}) picks the run of a
   * frequency-based trip; undefined or empty answers the run with the earliest start time. A malformed date or start
   * time fails as `bad_request` without a request.
   */
  async vehicleForTrip(tripId: string, serviceDate: string, startTime?: string): Promise<SpiderResult<LiveVehicleUpdate>> {
    const invalid = invalidServiceDate(serviceDate) ?? invalidStartTime(startTime);
    if (invalid != null) return failure(invalid);
    const path = `/realtime/v1/vehicles/by-trip/${encodeURIComponent(tripId)}`;
    const run = startTimeOrUndefined(startTime);
    try {
      const raw = await this.transport.getRaw(path, run !== undefined ? { serviceDate, startTime: run } : { serviceDate });
      if (!raw.ok) {
        const error = httpFailure(`GET ${path}`, raw.status, raw.text);
        // A 404 is "no vehicle" unless its body names a plan limit.
        if (raw.status === 404 && limitRefusal(error) == null) {
          return success({ vehicle: null, freshness: EMPTY_FRESHNESS });
        }
        throw error;
      }
      const dto = parseJson<VehicleByTripResponseWire>(raw.text, path);
      return success({
        vehicle: dto.vehicle !== undefined ? mapVehicle(dto.vehicle) : null,
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  /**
   * Live delays for trips on one GTFS service date (ISO `YYYY-MM-DD`, a plan leg's or departure's `serviceDate`).
   * Trip ids are feed-prefixed (`<feedId>:<id>`), as routing returns them, and sent untouched; duplicates are
   * dropped and the rest sorted, so equal requests share a cache entry. A malformed date, no ids, a blank id or
   * more than 50 distinct ids fails as `bad_request` without a request.
   * @deprecated The API retires `/realtime/v1/delays` (not before 2027-05-24); use {@link tripUpdates}, which takes
   * the same arguments and also lists every run of a frequency-based trip and its trip modifications.
   */
  async delays(serviceDate: string, tripIds: readonly string[]): Promise<SpiderResult<TripDelays>> {
    const ids = tripIdsQuery(serviceDate, tripIds);
    if (typeof ids !== 'string') return failure(ids);
    try {
      const dto = await this.transport.getJson<DelaysResponseWire>('/realtime/v1/delays', {
        serviceDate,
        tripIds: ids,
      });
      return success({
        serviceDate: dto.serviceDate,
        delays: dto.delays.map(mapDelay),
        missing: dto.missing,
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  /**
   * Live trip updates for trips on one GTFS service date (ISO `YYYY-MM-DD`, a plan leg's or departure's
   * `serviceDate`): each trip run's delay and stop-time updates, and the trip modifications (detours, experimental)
   * that apply to it. A frequency-based trip gives one update per run, told apart by `startTime`. Trip ids are
   * feed-prefixed (`<feedId>:<id>`), as routing returns them, and sent untouched; duplicates are dropped and the rest
   * sorted, so equal requests share a cache entry. A malformed date, no ids, a blank id or more than 50 distinct ids
   * fails as `bad_request` without a request.
   */
  async tripUpdates(serviceDate: string, tripIds: readonly string[]): Promise<SpiderResult<TripUpdates>> {
    const ids = tripIdsQuery(serviceDate, tripIds);
    if (typeof ids !== 'string') return failure(ids);
    try {
      const dto = await this.transport.getJson<TripUpdatesResponseWire>('/realtime/v1/trip-updates', {
        serviceDate,
        tripIds: ids,
      });
      return success({
        serviceDate: dto.serviceDate,
        tripUpdates: dto.tripUpdates.map(mapTripUpdate),
        missing: dto.missing,
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  async alerts(): Promise<SpiderResult<ServiceAlerts>> {
    try {
      const dto = await this.transport.getJson<AlertsResponseWire>('/realtime/v1/alerts');
      return success({
        alerts: dto.alerts.map(mapAlert),
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }
}

function tripIdsQuery(serviceDate: string, tripIds: readonly string[]): string | SpiderError {
  const invalid = invalidServiceDate(serviceDate);
  if (invalid != null) return invalid;
  const ids = [...new Set(tripIds)].sort();
  if (ids.length === 0) return badRequest('tripIds', 'is required');
  if (ids.some((id) => id.trim() === '')) return badRequest('tripIds', 'is invalid');
  if (ids.length > MAX_TRIP_IDS) return badRequest('tripIds');
  return ids.join(',');
}

function secondsToMs(value: number | null | undefined): number | null {
  return value != null ? value * 1000 : null;
}

function mapFreshness(dto: FreshnessWire): FeedFreshness {
  return { feedTimestampEpochMs: secondsToMs(dto.feedTimestamp), staleSeconds: dto.staleSeconds ?? null };
}

function mapVehicle(v: VehicleDtoWire): LiveVehicle {
  return {
    tripId: v.tripId,
    serviceDate: v.serviceDate,
    startTime: v.startTime ?? null,
    routeId: v.routeId ?? null,
    vehicleId: v.vehicleId ?? null,
    label: v.label ?? null,
    latitude: v.latitude,
    longitude: v.longitude,
    bearing: v.bearing ?? null,
    speed: v.speed ?? null,
    stopId: v.stopId ?? null,
    currentStatus: v.currentStatus ?? null,
    occupancy: occupancyFromWire(v.occupancyStatus),
    timestampEpochMs: secondsToMs(v.timestamp),
    wheelchairAccessible: vehicleWheelchairFromWire(v.wheelchairAccessible),
    airConditioning: v.airConditioning ?? null,
    wifi: v.wifi ?? null,
    cardPayment: v.cardPayment ?? null,
  };
}

function mapTripUpdate(u: TripUpdateDtoWire): TripUpdate {
  return {
    tripId: u.tripId,
    startTime: u.startTime ?? null,
    routeId: u.routeId ?? null,
    delaySeconds: u.delaySeconds ?? null,
    scheduleRelationship: u.scheduleRelationship ?? null,
    stopTimeUpdates: u.stopTimeUpdates.map(mapStopTimeUpdate),
    modifications: (u.modifications ?? []).map(mapTripModification),
    vehicle: u.vehicle !== undefined ? mapTripUpdateVehicle(u.vehicle) : null,
  };
}

function mapTripUpdateVehicle(v: TripUpdateVehicleDtoWire): TripVehicle {
  return {
    id: v.id ?? null,
    label: v.label ?? null,
    wheelchairAccessible: vehicleWheelchairFromWire(v.wheelchairAccessible),
    airConditioning: v.airConditioning ?? null,
    wifi: v.wifi ?? null,
    cardPayment: v.cardPayment ?? null,
  };
}

function mapTripModification(m: TripModificationDtoWire): TripModification {
  return {
    id: m.id,
    startTimes: m.startTimes ?? null,
    startStop: m.startStop !== undefined ? mapStopSelector(m.startStop) : null,
    endStop: m.endStop !== undefined ? mapStopSelector(m.endStop) : null,
    replacementStops: m.replacementStops.map((s) => ({
      stopId: s.stopId ?? null,
      travelTimeToStopSeconds: s.travelTimeToStop ?? null,
      name: s.name ?? null,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
    })),
    propagatedModificationDelaySeconds: m.propagatedModificationDelay,
    alertId: m.alertId ?? null,
    lastModifiedEpochMs: secondsToMs(m.lastModifiedTime),
    shape: m.shape !== undefined ? decodePolyline(m.shape, 1e5) : null,
  };
}

function mapStopSelector(s: StopSelectorDtoWire): StopSelector {
  return { stopSequence: s.stopSequence ?? null, stopId: s.stopId ?? null };
}

function mapDelay(d: DelayDtoWire): TripDelay {
  return {
    tripId: d.tripId,
    routeId: d.routeId ?? null,
    delaySeconds: d.delaySeconds ?? null,
    scheduleRelationship: d.scheduleRelationship ?? null,
    stopTimeUpdates: d.stopTimeUpdates.map(mapStopTimeUpdate),
  };
}

function mapStopTimeUpdate(s: StopTimeUpdateDtoWire): StopTimeUpdate {
  return {
    stopId: s.stopId ?? null,
    stopSequence: s.stopSequence ?? null,
    arrivalDelay: s.arrivalDelay ?? null,
    departureDelay: s.departureDelay ?? null,
    scheduleRelationship: s.scheduleRelationship ?? null,
  };
}

function mapAlert(a: AlertDtoWire): ServiceAlert {
  return {
    id: a.id,
    cause: a.cause ?? null,
    effect: a.effect ?? null,
    severityLevel: a.severityLevel ?? null,
    headerText: a.headerText ?? null,
    descriptionText: a.descriptionText ?? null,
    url: a.url ?? null,
    activePeriods: a.activePeriods.map((p) => ({
      startEpochMs: secondsToMs(p.start),
      endEpochMs: secondsToMs(p.end),
    })),
    informedEntities: a.informedEntities.map((e) => ({
      agencyId: e.agencyId ?? null,
      routeId: e.routeId ?? null,
      tripId: e.tripId ?? null,
      stopId: e.stopId ?? null,
    })),
  };
}

// The realtime surface omits a member it has no value for, never sends null.
interface FreshnessWire {
  feedTimestamp?: number;
  staleSeconds?: number;
}

interface VehicleDtoWire {
  tripId: string;
  serviceDate: string;
  routeId?: string;
  vehicleId?: string;
  label?: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  stopId?: string;
  currentStatus?: string;
  occupancyStatus?: string;
  timestamp?: number;
  startTime?: string;
  wheelchairAccessible?: string;
  airConditioning?: boolean;
  wifi?: boolean;
  cardPayment?: boolean;
}

interface VehiclesResponseWire extends FreshnessWire {
  vehicles: VehicleDtoWire[];
  missing: string[];
}

interface VehicleByTripResponseWire extends FreshnessWire {
  vehicle?: VehicleDtoWire;
}

interface DelayDtoWire {
  tripId: string;
  routeId?: string;
  delaySeconds?: number;
  scheduleRelationship?: string;
  stopTimeUpdates: StopTimeUpdateDtoWire[];
}

interface StopTimeUpdateDtoWire {
  stopId?: string;
  stopSequence?: number;
  arrivalDelay?: number;
  departureDelay?: number;
  scheduleRelationship?: string;
}

interface DelaysResponseWire extends FreshnessWire {
  serviceDate: string;
  delays: DelayDtoWire[];
  missing: string[];
}

interface StopSelectorDtoWire {
  stopSequence?: number;
  stopId?: string;
}

interface ReplacementStopDtoWire {
  stopId?: string;
  travelTimeToStop?: number;
  name?: string;
  latitude?: number;
  longitude?: number;
}

interface TripModificationDtoWire {
  id: string;
  startTimes?: string[];
  startStop?: StopSelectorDtoWire;
  endStop?: StopSelectorDtoWire;
  replacementStops: ReplacementStopDtoWire[];
  propagatedModificationDelay: number;
  alertId?: string;
  lastModifiedTime?: number;
  shape?: string;
}

interface TripUpdateDtoWire {
  tripId: string;
  startTime?: string;
  routeId?: string;
  delaySeconds?: number;
  scheduleRelationship?: string;
  stopTimeUpdates: StopTimeUpdateDtoWire[];
  modifications?: TripModificationDtoWire[];
  vehicle?: TripUpdateVehicleDtoWire;
}

interface TripUpdateVehicleDtoWire {
  id?: string;
  label?: string;
  wheelchairAccessible?: string;
  airConditioning?: boolean;
  wifi?: boolean;
  cardPayment?: boolean;
}

interface TripUpdatesResponseWire extends FreshnessWire {
  serviceDate: string;
  tripUpdates: TripUpdateDtoWire[];
  missing: string[];
}

interface ActivePeriodDtoWire {
  start?: number;
  end?: number;
}

interface InformedEntityDtoWire {
  agencyId?: string;
  routeId?: string;
  tripId?: string;
  stopId?: string;
}

interface AlertDtoWire {
  id: string;
  cause?: string;
  effect?: string;
  severityLevel?: string;
  headerText?: string;
  descriptionText?: string;
  url?: string;
  activePeriods: ActivePeriodDtoWire[];
  informedEntities: InformedEntityDtoWire[];
}

interface AlertsResponseWire extends FreshnessWire {
  alerts: AlertDtoWire[];
}
