import type { PickupDropoffType } from './PickupDropoffType.ts';
import type { RealtimeState } from './RealtimeState.ts';
import type { TripStop } from './TripStop.ts';

export interface Stoptime {
  /** Unix seconds at the start of the trip's service day; it plus a seconds field gives that time as Unix seconds. */
  serviceDay: number;
  /** Seconds after `serviceDay`. */
  scheduledArrival: number;
  /** Seconds after `serviceDay`. */
  scheduledDeparture: number;
  /** Seconds after `serviceDay`, realtime merged in; the schedule when there is none. */
  realtimeArrival: number;
  /** Seconds after `serviceDay`, realtime merged in; the schedule when there is none. */
  realtimeDeparture: number;
  /** True when `realtimeArrival` and `realtimeDeparture` come from realtime. */
  realtime: boolean;
  realtimeState: RealtimeState;
  /** Seconds of delay at the requested `reliability`: that level's percentile of the trip's recorded delay at this stop on the service date's day type, from the environment's realtime history. Never below 0. At each level, no trip arrives at a stop, delay applied, before an earlier trip of the same pattern does. Null when `reliability` is omitted, when the trip has live realtime, a canceled trip included, or when there is no history. */
  typicalDelay: number | null;
  /** How a rider boards here. Null when the stop is canceled: the trip is canceled or realtime skips the stop. */
  pickupType: PickupDropoffType | null;
  /** How a rider alights here. Null when the stop is canceled: the trip is canceled or realtime skips the stop. */
  dropoffType: PickupDropoffType | null;
  /** The stop time's position in the trip: increasing along it, not necessarily from 0 or consecutive. Realtime that adds or removes stops can change it. */
  stopPosition: number | null;
  /** Index into the decoded `tripGeometry` points of where this stop sits on the trip's line. Null when `tripGeometry` is null or the stop has no point on it. */
  geometryIndex: number | null;
  stop: TripStop;
}
