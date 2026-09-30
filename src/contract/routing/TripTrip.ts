import type { BikesAllowed } from './BikesAllowed.ts';
import type { Stoptime } from './Stoptime.ts';
import type { TripGeometry } from './TripGeometry.ts';
import type { TripRoute } from './TripRoute.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface TripTrip {
  gtfsId: string;
  directionId?: string;
  tripHeadsign?: string;
  bikesAllowed?: BikesAllowed;
  wheelchairAccessible?: WheelchairBoarding;
  route: TripRoute;
  stoptimesForDate?: Stoptime[];
  tripGeometry?: TripGeometry;
}
