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
  realtimeState?: RealtimeState;
  realTime?: boolean;
  from: Place;
  to: Place;
  route?: Route;
  headsign?: string;
  distance?: number;
  duration?: number;
  accessibilityScore?: number;
  trip?: Trip;
  legGeometry?: Geometry;
}
