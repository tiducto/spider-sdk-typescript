import type { Geometry } from './Geometry.ts';
import type { LegTime } from './LegTime.ts';
import type { Mode } from './Mode.ts';
import type { Place } from './Place.ts';
import type { RealtimeState } from './RealtimeState.ts';
import type { Route } from './Route.ts';
import type { Trip } from './Trip.ts';

export interface Leg {
  mode?: Mode;
  start: LegTime;
  end: LegTime;
  /** Delay in seconds applied to this leg's arrival at the requested `reliability`; null when omitted or unknown. */
  typicalArrivalDelay?: number;
  realtimeState?: RealtimeState;
  realTime?: boolean;
  serviceDate?: string;
  from: Place;
  to: Place;
  route?: Route;
  headsign?: string;
  distance?: number;
  duration?: number;
  accessibilityScore?: number;
  trip?: Trip;
  interlineWithPreviousLeg?: boolean;
  legGeometry?: Geometry;
}
