import type { RealtimeState } from './RealtimeState.ts';
import type { StopDeparturesStop } from './StopDeparturesStop.ts';
import type { StopDeparturesTrip } from './StopDeparturesTrip.ts';

export interface StopDeparturesStoptime {
  /** Unix seconds at the start of the trip's service day; it plus a seconds field gives that time as Unix seconds. */
  serviceDay?: number;
  /** Seconds after `serviceDay`. */
  scheduledDeparture?: number;
  /** Seconds after `serviceDay`, realtime merged in; the schedule when there is none. */
  realtimeDeparture?: number;
  /** True when `realtimeDeparture` comes from realtime. */
  realtime?: boolean;
  realtimeState?: RealtimeState;
  /** The usual delay at this stop in seconds: the median recorded for that trip on the service date's day type, from the environment's realtime history. Null when there is no history. */
  typicalDelay?: number;
  headsign?: string;
  /** The platform or stand the departure leaves from, which tells a station's platforms apart. */
  stop?: StopDeparturesStop;
  trip?: StopDeparturesTrip;
}
