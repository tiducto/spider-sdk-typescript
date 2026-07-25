import type { BikesAllowed } from './BikesAllowed.ts';
import type { Geometry } from './Geometry.ts';
import type { Route } from './Route.ts';
import type { TripStoptime } from './TripStoptime.ts';

export interface TripTrip {
  gtfsId: string;
  directionId?: string;
  tripHeadsign?: string;
  bikesAllowed?: BikesAllowed;
  route: Route;
  stoptimesForDate?: TripStoptime[];
  tripGeometry?: Geometry;
}
