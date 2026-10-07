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
  stop: TripStop;
}
