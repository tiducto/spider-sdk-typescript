// Every decoded enum is a closed union: a wire value this SDK version doesn't know decodes to 'UNKNOWN', so
// a newer server can add values without breaking older apps.

export type TransitMode =
  | 'AIRPLANE'
  | 'BICYCLE'
  | 'BUS'
  | 'CABLE_CAR'
  | 'CAR'
  | 'CARPOOL'
  | 'COACH'
  | 'FERRY'
  | 'FLEX'
  | 'FLEXIBLE'
  | 'FUNICULAR'
  | 'GONDOLA'
  | 'LEG_SWITCH'
  | 'MONORAIL'
  | 'RAIL'
  | 'SCOOTER'
  | 'SNOW_AND_ICE'
  | 'SUBWAY'
  | 'TAXI'
  | 'TRAM'
  | 'TRANSIT'
  | 'TROLLEYBUS'
  | 'WALK'
  | 'UNKNOWN';

export type WheelchairBoarding = 'Possible' | 'NotPossible' | 'UNKNOWN';

export type BikesAllowed = 'Allowed' | 'NotAllowed' | 'UNKNOWN';

export type OccupancyStatus =
  | 'EMPTY'
  | 'MANY_SEATS_AVAILABLE'
  | 'FEW_SEATS_AVAILABLE'
  | 'STANDING_ROOM_ONLY'
  | 'CRUSHED_STANDING_ROOM_ONLY'
  | 'FULL'
  | 'NOT_ACCEPTING_PASSENGERS'
  | 'NOT_BOARDABLE'
  | 'UNKNOWN';

export type RealtimeState = 'ADDED' | 'CANCELED' | 'MODIFIED' | 'SCHEDULED' | 'UPDATED' | 'UNKNOWN';

export type RoutingErrorCode =
  | 'LOCATION_NOT_FOUND'
  | 'NO_STOPS_IN_RANGE'
  | 'NO_TRANSIT_CONNECTION'
  | 'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW'
  | 'OUTSIDE_BOUNDS'
  | 'OUTSIDE_SERVICE_PERIOD'
  | 'WALKING_BETTER_THAN_TRANSIT'
  | 'UNKNOWN';

export type InputField = 'DATE_TIME' | 'FROM' | 'TO' | 'VIA' | 'UNKNOWN';

type Known<T extends string> = Record<Exclude<T, 'UNKNOWN'>, true>;

const TRANSIT_MODES: Known<TransitMode> = {
  AIRPLANE: true, BICYCLE: true, BUS: true, CABLE_CAR: true, CAR: true, CARPOOL: true, COACH: true, FERRY: true,
  FLEX: true, FLEXIBLE: true, FUNICULAR: true, GONDOLA: true, LEG_SWITCH: true, MONORAIL: true, RAIL: true,
  SCOOTER: true, SNOW_AND_ICE: true, SUBWAY: true, TAXI: true, TRAM: true, TRANSIT: true, TROLLEYBUS: true, WALK: true,
};

const OCCUPANCY_STATUSES: Known<OccupancyStatus> = {
  EMPTY: true, MANY_SEATS_AVAILABLE: true, FEW_SEATS_AVAILABLE: true, STANDING_ROOM_ONLY: true,
  CRUSHED_STANDING_ROOM_ONLY: true, FULL: true, NOT_ACCEPTING_PASSENGERS: true, NOT_BOARDABLE: true,
};

const REALTIME_STATES: Known<RealtimeState> = { ADDED: true, CANCELED: true, MODIFIED: true, SCHEDULED: true, UPDATED: true };

const ROUTING_ERROR_CODES: Known<RoutingErrorCode> = {
  LOCATION_NOT_FOUND: true, NO_STOPS_IN_RANGE: true, NO_TRANSIT_CONNECTION: true,
  NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW: true, OUTSIDE_BOUNDS: true, OUTSIDE_SERVICE_PERIOD: true,
  WALKING_BETTER_THAN_TRANSIT: true,
};

const INPUT_FIELDS: Known<InputField> = { DATE_TIME: true, FROM: true, TO: true, VIA: true };

function decode<T extends string>(known: Known<T>, raw: string): T {
  return (Object.hasOwn(known, raw) ? raw : 'UNKNOWN') as T;
}

export function transitModeFromWire(raw: string | null | undefined): TransitMode | null {
  return raw == null ? null : decode(TRANSIT_MODES, raw);
}

export function realtimeStateFromWire(raw: string | null | undefined): RealtimeState | null {
  return raw == null ? null : decode(REALTIME_STATES, raw);
}

export function routingErrorCodeFromWire(raw: string | null | undefined): RoutingErrorCode {
  return raw == null ? 'UNKNOWN' : decode(ROUTING_ERROR_CODES, raw);
}

export function inputFieldFromWire(raw: string | null | undefined): InputField | null {
  return raw == null ? null : decode(INPUT_FIELDS, raw);
}

export function wheelchairFromWire(raw: string | null | undefined): WheelchairBoarding | null {
  if (raw == null || raw === 'NO_INFORMATION') return null;
  if (raw === 'POSSIBLE') return 'Possible';
  if (raw === 'NOT_POSSIBLE') return 'NotPossible';
  return 'UNKNOWN';
}

export function bikesAllowedFromWire(raw: string | null | undefined): BikesAllowed | null {
  if (raw == null || raw === 'NO_INFORMATION') return null;
  if (raw === 'ALLOWED') return 'Allowed';
  if (raw === 'NOT_ALLOWED') return 'NotAllowed';
  return 'UNKNOWN';
}

export function occupancyFromWire(raw: string | null | undefined): OccupancyStatus | null {
  if (raw == null || raw === 'NO_DATA_AVAILABLE') return null;
  return decode(OCCUPANCY_STATUSES, raw);
}
