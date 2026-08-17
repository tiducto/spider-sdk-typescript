import type { BikesAllowed } from './BikesAllowed.ts';
import type { TripGeometry } from './TripGeometry.ts';
import type { TripRoute } from './TripRoute.ts';
import type { TripStoptime } from './TripStoptime.ts';

export interface TripTrip {
  gtfsId: string;
  directionId?: string;
  tripHeadsign?: string;
  bikesAllowed?: BikesAllowed;
  route: TripRoute;
  stoptimesForDate?: TripStoptime[];
  tripGeometry?: TripGeometry;
}
