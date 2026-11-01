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
  /** Seconds of delay applied to this leg's arrival at the requested `reliability`: that level's percentile of the trip's recorded delay at the alighting stop on the service date's day type, from the environment's realtime history. Never below 0. At each level, no trip arrives at a stop, delay applied, before an earlier trip of the same pattern does. Null when `reliability` is omitted, when the trip has live realtime, a canceled trip included, or when there is no history, and on a walk leg. */
  typicalArrivalDelay: number | null;
  /** The realtime state of the leg's trip; `SCHEDULED` on a walk leg. */
  realtimeState: RealtimeState;
  /** True when the leg's times include realtime. */
  realTime: boolean;
  /** The GTFS service date of the leg's trip, `YYYY-MM-DD`; null on a walk leg. */
  serviceDate: string | null;
  from: Place;
  to: Place;
  /** Null on a walk leg. */
  route: Route | null;
  /** Null on a walk leg and when the feed has none. */
  headsign: string | null;
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** Null on a walk leg. */
  trip: Trip | null;
  /** True on a transit leg ridden in the same vehicle as the previous leg: the vehicle carries on as another trip, often under another line number, and the rider stays on board. That change is not counted in `numberOfTransfers`. False on every other leg. */
  interlineWithPreviousLeg: boolean;
  legGeometry: Geometry;
}
