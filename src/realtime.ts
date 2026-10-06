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
  readonly tripId: string | null;
  readonly routeId: string | null;
  readonly vehicleId: string | null;
  readonly label: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
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

export interface TripDelay {
  readonly tripId: string | null;
  readonly routeId: string | null;
  readonly delaySeconds: number | null;
  readonly scheduleRelationship: string | null;
  readonly stopTimeUpdates: readonly StopTimeUpdate[];
}

/** Delays for one GTFS service date: those the feed reported, and the `missing` trip ids it didn't. */
export interface ServiceDateDelays {
  readonly serviceDate: string;
  readonly delays: readonly TripDelay[];
  readonly missing: readonly string[];
}

/**
 * Result of {@link SpiderRealtime.delays}: delays grouped by service date (the same `tripId` on two dates is
 * two distinct instances), plus feed freshness. Look up a single instance with {@link delayFor}.
 */
export interface TripDelays {
  readonly groups: readonly ServiceDateDelays[];
  readonly freshness: FeedFreshness;
}

/** The delay for the (`tripId`, `serviceDate`) instance, if the feed reported one; otherwise null. */
export function delayFor(delays: TripDelays, tripId: string, serviceDate: string): TripDelay | null {
  const group = delays.groups.find((g) => g.serviceDate === serviceDate);
  return group?.delays.find((d) => d.tripId === tripId) ?? null;
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
  readonly id: string | null;
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
const EMPTY_DELAYS: TripDelays = { groups: [], freshness: EMPTY_FRESHNESS };
const MAX_TRIP_IDS = 50;

export class SpiderRealtime {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /** Live positions for up to 50 trips. Empty input skips the call; more than 50 fails as `bad_request` without a request. */
  async vehicles(tripIds: readonly string[]): Promise<SpiderResult<VehiclePositions>> {
    if (tripIds.length === 0) return success(EMPTY_POSITIONS);
    if (tripIds.length > MAX_TRIP_IDS) return failure(badRequest('tripIds'));
    try {
      const dto = await this.transport.getJson<VehiclesResponseWire>('/realtime/v1/vehicles', {
        tripIds: tripIds.join(','),
      });
      return success({
        vehicles: (dto.vehicles ?? []).map(mapVehicle),
        missing: dto.missing ?? [],
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

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
        vehicle: dto.vehicle != null ? mapVehicle(dto.vehicle) : null,
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      return failure(toSpiderError(e));
    }
  }

  /**
   * Live delays, resolved per `(tripId, serviceDate)` instance: group trip ids by the GTFS service date
   * (ISO `YYYY-MM-DD`) they run on — pass each plan leg's or departure's `serviceDate` through. Up to 50 trip ids
   * in total across all dates. Empty input skips the call; a malformed date or more than 50 ids fails as
   * `bad_request` without a request.
   */
  async delays(byServiceDate: Readonly<Record<string, readonly string[]>>): Promise<SpiderResult<TripDelays>>;
  /** Live delays for `tripIds` all on one `serviceDate` (ISO `YYYY-MM-DD`) — the common single-day case. */
  async delays(tripIds: readonly string[], serviceDate: string): Promise<SpiderResult<TripDelays>>;
  async delays(
    arg: Readonly<Record<string, readonly string[]>> | readonly string[],
    serviceDate?: string,
  ): Promise<SpiderResult<TripDelays>> {
    const byServiceDate = serviceDate !== undefined
      ? { [serviceDate]: arg as readonly string[] }
      : arg as Readonly<Record<string, readonly string[]>>;
    const queries = Object.entries(byServiceDate).map(([date, tripIds]) => ({ serviceDate: date, tripIds: [...tripIds] }));
    for (const q of queries) {
      const invalid = invalidServiceDate(q.serviceDate);
      if (invalid != null) return failure(invalid);
    }
    const total = queries.reduce((n, q) => n + q.tripIds.length, 0);
    if (total === 0) return success(EMPTY_DELAYS);
    if (total > MAX_TRIP_IDS) return failure(badRequest('tripIds'));
    try {
      const request: DelaysRequestWire = { queries };
      const dto = await this.transport.postJson<DelaysResponseWire>('/realtime/v1/delays', request);
      return success({
        groups: (dto.results ?? []).map(mapGroupResult),
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
        alerts: (dto.alerts ?? []).map(mapAlert),
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
    tripId: v.tripId ?? null,
    routeId: v.routeId ?? null,
    vehicleId: v.vehicleId ?? null,
    label: v.label ?? null,
    latitude: v.latitude ?? null,
    longitude: v.longitude ?? null,
    bearing: v.bearing ?? null,
    speed: v.speed ?? null,
    stopId: v.stopId ?? null,
    currentStatus: v.currentStatus ?? null,
    occupancy: occupancyFromWire(v.occupancyStatus),
    timestampEpochMs: secondsToMs(v.timestamp),
  };
}

function mapGroupResult(g: DelayGroupResultDtoWire): ServiceDateDelays {
  return {
    serviceDate: g.serviceDate,
    delays: (g.delays ?? []).map(mapDelay),
    missing: g.missing ?? [],
  };
}

function mapDelay(d: DelayDtoWire): TripDelay {
  return {
    tripId: d.tripId ?? null,
    routeId: d.routeId ?? null,
    delaySeconds: d.delaySeconds ?? null,
    scheduleRelationship: d.scheduleRelationship ?? null,
    stopTimeUpdates: (d.stopTimeUpdates ?? []).map(mapStopTimeUpdate),
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
    id: a.id ?? null,
    cause: a.cause ?? null,
    effect: a.effect ?? null,
    severityLevel: a.severityLevel ?? null,
    headerText: a.headerText ?? null,
    descriptionText: a.descriptionText ?? null,
    url: a.url ?? null,
    activePeriods: (a.activePeriods ?? []).map((p) => ({
      startEpochMs: secondsToMs(p.start),
      endEpochMs: secondsToMs(p.end),
    })),
    informedEntities: (a.informedEntities ?? []).map((e) => ({
      agencyId: e.agencyId ?? null,
      routeId: e.routeId ?? null,
      tripId: e.tripId ?? null,
      stopId: e.stopId ?? null,
    })),
  };
}

interface FreshnessWire {
  feedTimestamp?: number | null;
  staleSeconds?: number | null;
}

interface VehicleDtoWire {
  tripId?: string | null;
  routeId?: string | null;
  vehicleId?: string | null;
  label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  bearing?: number | null;
  speed?: number | null;
  stopId?: string | null;
  currentStatus?: string | null;
  occupancyStatus?: string | null;
  timestamp?: number | null;
}

interface VehiclesResponseWire extends FreshnessWire {
  vehicles?: VehicleDtoWire[];
  missing?: string[];
}

interface VehicleByTripResponseWire extends FreshnessWire {
  vehicle?: VehicleDtoWire | null;
}

interface DelayDtoWire {
  tripId?: string | null;
  routeId?: string | null;
  delaySeconds?: number | null;
  scheduleRelationship?: string | null;
  stopTimeUpdates?: StopTimeUpdateDtoWire[];
}

interface StopTimeUpdateDtoWire {
  stopId?: string | null;
  stopSequence?: number | null;
  arrivalDelay?: number | null;
  departureDelay?: number | null;
  scheduleRelationship?: string | null;
}

interface DelayQueryDtoWire {
  serviceDate: string;
  tripIds: string[];
}

interface DelaysRequestWire {
  queries: DelayQueryDtoWire[];
}

interface DelayGroupResultDtoWire {
  serviceDate: string;
  delays?: DelayDtoWire[];
  missing?: string[];
}

interface DelaysResponseWire extends FreshnessWire {
  results?: DelayGroupResultDtoWire[];
}

interface ActivePeriodDtoWire {
  start?: number | null;
  end?: number | null;
}

interface InformedEntityDtoWire {
  agencyId?: string | null;
  routeId?: string | null;
  tripId?: string | null;
  stopId?: string | null;
}

interface AlertDtoWire {
  id?: string | null;
  cause?: string | null;
  effect?: string | null;
  severityLevel?: string | null;
  headerText?: string | null;
  descriptionText?: string | null;
  url?: string | null;
  activePeriods?: ActivePeriodDtoWire[];
  informedEntities?: InformedEntityDtoWire[];
}

interface AlertsResponseWire extends FreshnessWire {
  alerts?: AlertDtoWire[];
}
