import type { PickupDropoffType } from './PickupDropoffType.ts';
import type { RealtimeState } from './RealtimeState.ts';
import type { StopDeparturesStop } from './StopDeparturesStop.ts';
import type { StopDeparturesTrip } from './StopDeparturesTrip.ts';

export interface StopDeparturesStoptime {
  /** Unix seconds at the start of the trip's service day; it plus a seconds field gives that time as Unix seconds. */
  serviceDay: number;
  /** The GTFS service date of the departure's trip, `YYYY-MM-DD`, as `Leg.serviceDate`. For a departure past 24:00 of its service day, it is the day before the departure's calendar date. */
  serviceDate: string;
  /** Seconds after `serviceDay`. */
  scheduledDeparture: number;
  /** Seconds after `serviceDay`, realtime merged in; the schedule when there is none. */
  realtimeDeparture: number;
  /** True when `realtimeDeparture` comes from realtime. */
  realtime: boolean;
  realtimeState: RealtimeState;
  /** Seconds of delay at the requested `reliability`: that level's percentile of the trip's recorded delay at this stop on the service date's day type, from the environment's realtime history. Never below 0. At each level, no trip arrives at a stop, delay applied, before an earlier trip of the same pattern does. Null when `reliability` is omitted, when the trip has live realtime, a canceled trip included, or when there is no history. */
  typicalDelay: number | null;
  /** How a rider boards here. Never `NONE`: the board leaves out departures nobody can board. */
  pickupType: PickupDropoffType;
  /** How a rider alights here. */
  dropoffType: PickupDropoffType;
  /** Null when the feed has none. */
  headsign: string | null;
  /** The position in the trip of this departure, as the trip's `stopPosition`. */
  stopPosition: number | null;
  /** The platform or stand the departure leaves from, which tells a station's platforms apart. */
  stop: StopDeparturesStop;
  trip: StopDeparturesTrip;
}
