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
  /** The trip's usual delay at this stop in seconds: the median (p50) recorded on the service date's day type, from the environment's realtime history, never below 0 and never decreasing along the trip's pattern. Null when the trip has live realtime or there is no history. */
  typicalDelay: number | null;
  /** The stop time's position in the trip: increasing along it, not necessarily from 0 or consecutive. Realtime that adds or removes stops can change it. */
  stopPosition: number | null;
  /** Index into the decoded `tripGeometry` points of where this stop sits on the trip's line. Null when `tripGeometry` is null or the stop has no point on it. */
  geometryIndex: number | null;
  stop: TripStop;
}
