import type { Geometry } from './Geometry.ts';
import type { LegTime } from './LegTime.ts';
import type { Mode } from './Mode.ts';
import type { Place } from './Place.ts';
import type { RealtimeState } from './RealtimeState.ts';
import type { Route } from './Route.ts';
import type { Trip } from './Trip.ts';

/** One walk or ride. */
export interface Leg {
  mode: Mode;
  start: LegTime;
  end: LegTime;
  /** Seconds of delay applied to this leg's arrival at the requested `reliability`: that level's percentile (p50, p70 or p90) of the trip's recorded delay at the alighting stop on the service date's day type, from the environment's realtime history, never below 0 and never decreasing along the trip's pattern. Null when `reliability` is omitted, the trip has live realtime or there is no history, and on a walk leg. */
  typicalArrivalDelay: number;
  realtimeState: RealtimeState;
  /** True when the leg's times include realtime. */
  realTime: boolean;
  /** The GTFS service date of the leg's trip, `YYYY-MM-DD`; null on a walk leg. */
  serviceDate: string;
  from: Place;
  to: Place;
  /** Null on a walk leg. */
  route: Route | unknown;
  /** Null on a walk leg and when the feed has none. */
  headsign: string;
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** Null on a walk leg. */
  trip: Trip | unknown;
  /** True on a transit leg ridden in the same vehicle as the previous leg: the vehicle carries on as another trip, often under another line number, and the rider stays on board. That change is not counted in `numberOfTransfers`. False on every other leg. */
  interlineWithPreviousLeg: boolean;
  legGeometry: Geometry;
}
