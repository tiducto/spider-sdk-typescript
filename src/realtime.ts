import type { Transport } from './http.ts';
import { parseJson } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import { badRequest, httpFailure, limitRefusal, toSpiderError } from './errors.ts';
import { invalidServiceDate } from './serviceDate.ts';
import type { OccupancyStatus } from './enums.ts';
import { occupancyFromWire } from './enums.ts';

export interface FeedFreshness {
  readonly feedTimestampEpochMs: number | null;
  readonly staleSeconds: number | null;
}

/** A vehicle's live position. `tripId`, `routeId`, `stopId` and `vehicleId` are feed-prefixed (`<feedId>:<id>`). */
export interface LiveVehicle {
  readonly tripId: string;
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

/** Result of {@link SpiderRealtime.delays}: the delays the feed reported for one service date, and the `missing` trip ids it didn't. */
export interface TripDelays {
  readonly serviceDate: string;
  readonly delays: readonly TripDelay[];
  readonly missing: readonly string[];
  readonly freshness: FeedFreshness;
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
   * Live positions for up to 50 feed-prefixed trip ids (`<feedId>:<id>`), sent untouched. Empty input skips the
   * call; more than 50 fails as `bad_request` without a request.
   */
  async vehicles(tripIds: readonly string[]): Promise<SpiderResult<VehiclePositions>> {
    if (tripIds.length === 0) return success(EMPTY_POSITIONS);
    if (tripIds.length > MAX_TRIP_IDS) return failure(badRequest('tripIds'));
    try {
      const dto = await this.transport.getJson<VehiclesResponseWire>('/realtime/v1/vehicles', {
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

  /** The live position of one feed-prefixed trip id (`<feedId>:<id>`), sent untouched; `vehicle` is null when none reports. */
  async vehicleForTrip(tripId: string): Promise<SpiderResult<LiveVehicleUpdate>> {
    const path = `/realtime/v1/vehicles/by-trip/${encodeURIComponent(tripId)}`;
    try {
      const raw = await this.transport.getRaw(path);
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
   */
  async delays(serviceDate: string, tripIds: readonly string[]): Promise<SpiderResult<TripDelays>> {
    const invalid = invalidServiceDate(serviceDate);
    if (invalid != null) return failure(invalid);
    const ids = [...new Set(tripIds)].sort();
    if (ids.length === 0) return failure(badRequest('tripIds', 'is required'));
    if (ids.some((id) => id.trim() === '')) return failure(badRequest('tripIds', 'is invalid'));
    if (ids.length > MAX_TRIP_IDS) return failure(badRequest('tripIds'));
    try {
      const dto = await this.transport.getJson<DelaysResponseWire>('/realtime/v1/delays', {
        serviceDate,
        tripIds: ids.join(','),
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

function secondsToMs(value: number | null | undefined): number | null {
  return value != null ? value * 1000 : null;
}

function mapFreshness(dto: FreshnessWire): FeedFreshness {
  return { feedTimestampEpochMs: secondsToMs(dto.feedTimestamp), staleSeconds: dto.staleSeconds ?? null };
}

function mapVehicle(v: VehicleDtoWire): LiveVehicle {
  return {
    tripId: v.tripId,
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
  };
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
