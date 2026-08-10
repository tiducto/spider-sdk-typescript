import type { Geometry } from './Geometry.ts';
import type { LegTime } from './LegTime.ts';
import type { Mode } from './Mode.ts';
import type { Place } from './Place.ts';
import type { PlanConnectionRoute } from './PlanConnectionRoute.ts';
import type { PlanConnectionTrip } from './PlanConnectionTrip.ts';
import type { RealtimeState } from './RealtimeState.ts';

export interface Leg {
  mode?: Mode;
  start: LegTime;
  end: LegTime;
  realtimeState?: RealtimeState;
  realTime?: boolean;
  from: Place;
  to: Place;
  route?: PlanConnectionRoute;
  headsign?: string;
  distance?: number;
  duration?: number;
  accessibilityScore?: number;
  trip?: PlanConnectionTrip;
  legGeometry?: Geometry;
}
