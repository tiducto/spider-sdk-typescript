import type { Transport } from './http.ts';
import { parseJson } from './http.ts';
import type { SpiderResult } from './result.ts';
import { failure, success } from './result.ts';
import { SpiderContractMismatchError, TransportError, toSpiderError } from './errors.ts';
import type { OccupancyStatus } from './enums.ts';
import { occupancyFromWire } from './enums.ts';

export interface FeedFreshness {
  readonly feedTimestampEpochMs: number | null;
  readonly staleSeconds: number | null;
}

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

export interface TripDelays {
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
const EMPTY_DELAYS: TripDelays = { delays: [], missing: [], freshness: EMPTY_FRESHNESS };

export class SpiderRealtime {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async vehicles(tripIds: readonly string[]): Promise<SpiderResult<VehiclePositions>> {
    if (tripIds.length === 0) return success(EMPTY_POSITIONS);
    try {
      const dto = await this.transport.getJson<VehiclesResponseWire>('/realtime/vehicles', {
        tripIds: tripIds.join(','),
      });
      return success({
        vehicles: (dto.vehicles ?? []).map(mapVehicle),
        missing: dto.missing ?? [],
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  async vehicleForTrip(tripId: string): Promise<SpiderResult<LiveVehicleUpdate>> {
    const path = `/realtime/vehicles/by-trip/${encodeURIComponent(tripId)}`;
    try {
      const raw = await this.transport.getRaw(path);
      if (raw.status === 404) {
        return success({ vehicle: null, freshness: EMPTY_FRESHNESS });
      }
      if (!raw.ok) {
        throw new TransportError('http', `GET ${path} -> ${raw.status}: ${raw.text.slice(0, 300)}`, raw.status);
      }
      const dto = parseJson<VehicleByTripResponseWire>(raw.text, path);
      return success({
        vehicle: dto.vehicle != null ? mapVehicle(dto.vehicle) : null,
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  async delays(tripIds: readonly string[]): Promise<SpiderResult<TripDelays>> {
    if (tripIds.length === 0) return success(EMPTY_DELAYS);
    try {
      const dto = await this.transport.getJson<DelaysResponseWire>('/realtime/delays', {
        tripIds: tripIds.join(','),
      });
      return success({
        delays: (dto.delays ?? []).map(mapDelay),
        missing: dto.missing ?? [],
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
      return failure(toSpiderError(e));
    }
  }

  async alerts(): Promise<SpiderResult<ServiceAlerts>> {
    try {
      const dto = await this.transport.getJson<AlertsResponseWire>('/realtime/alerts');
      return success({
        alerts: (dto.alerts ?? []).map(mapAlert),
        freshness: mapFreshness(dto),
      });
    } catch (e) {
      if (e instanceof SpiderContractMismatchError) throw e;
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

interface DelaysResponseWire extends FreshnessWire {
  delays?: DelayDtoWire[];
  missing?: string[];
}

interface AlertDtoWire {
  id?: string | null;
  cause?: string | null;
  effect?: string | null;
  severityLevel?: string | null;
  headerText?: string | null;
  descriptionText?: string | null;
  url?: string | null;
  activePeriods?: Array<{ start?: number | null; end?: number | null }>;
  informedEntities?: Array<{ agencyId?: string | null; routeId?: string | null; tripId?: string | null; stopId?: string | null }>;
}

interface AlertsResponseWire extends FreshnessWire {
  alerts?: AlertDtoWire[];
}
