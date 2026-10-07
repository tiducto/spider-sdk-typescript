import type { RealtimeState } from './RealtimeState.ts';
import type { StopDeparturesStop } from './StopDeparturesStop.ts';
import type { StopDeparturesTrip } from './StopDeparturesTrip.ts';

export interface StopDeparturesStoptime {
  /** Unix seconds at the start of the trip's service day; it plus a seconds field gives that time as Unix seconds. */
  serviceDay: number;
  /** Seconds after `serviceDay`. */
  scheduledDeparture: number;
  /** Seconds after `serviceDay`, realtime merged in; the schedule when there is none. */
  realtimeDeparture: number;
  /** True when `realtimeDeparture` comes from realtime. */
  realtime: boolean;
  realtimeState: RealtimeState;
  /** The trip's usual delay at this stop in seconds: the median (p50) recorded on the service date's day type, from the environment's realtime history, never below 0 and never decreasing along the trip's pattern. Null when the trip has live realtime or there is no history. */
  typicalDelay: number | null;
  /** Null when the feed has none. */
  headsign: string | null;
  /** The platform or stand the departure leaves from, which tells a station's platforms apart. */
  stop: StopDeparturesStop;
  trip: StopDeparturesTrip;
}
