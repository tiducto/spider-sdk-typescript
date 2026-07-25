export type TransitMode =
  | 'WALK'
  | 'BUS'
  | 'COACH'
  | 'TROLLEYBUS'
  | 'CARPOOL'
  | 'TRAM'
  | 'RAIL'
  | 'SUBWAY'
  | 'MONORAIL'
  | 'FERRY'
  | 'AIRPLANE'
  | 'TAXI'
  | 'UNKNOWN';

export type WheelchairBoarding = 'Possible' | 'NotPossible';

export type BikesAllowed = 'Allowed' | 'NotAllowed';

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

const TRANSIT_MODES: ReadonlySet<string> = new Set([
  'WALK', 'BUS', 'COACH', 'TROLLEYBUS', 'CARPOOL', 'TRAM', 'RAIL',
  'SUBWAY', 'MONORAIL', 'FERRY', 'AIRPLANE', 'TAXI',
]);

export function transitModeFromWire(raw: string | null | undefined): TransitMode | null {
  if (raw == null) return null;
  return TRANSIT_MODES.has(raw) ? (raw as TransitMode) : 'UNKNOWN';
}

export function wheelchairFromWire(raw: string | null | undefined): WheelchairBoarding | null {
  if (raw === 'POSSIBLE') return 'Possible';
  if (raw === 'NOT_POSSIBLE') return 'NotPossible';
  return null;
}

export function bikesAllowedFromWire(raw: string | null | undefined): BikesAllowed | null {
  if (raw === 'ALLOWED') return 'Allowed';
  if (raw === 'NOT_ALLOWED') return 'NotAllowed';
  return null;
}

const OCCUPANCY_STATUSES: ReadonlySet<string> = new Set([
  'EMPTY', 'MANY_SEATS_AVAILABLE', 'FEW_SEATS_AVAILABLE', 'STANDING_ROOM_ONLY',
  'CRUSHED_STANDING_ROOM_ONLY', 'FULL', 'NOT_ACCEPTING_PASSENGERS', 'NOT_BOARDABLE',
]);

export function occupancyFromWire(raw: string | null | undefined): OccupancyStatus | null {
  if (raw == null || raw === 'NO_DATA_AVAILABLE') return null;
  return OCCUPANCY_STATUSES.has(raw) ? (raw as OccupancyStatus) : 'UNKNOWN';
}
