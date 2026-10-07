import type { BikesAllowed } from './BikesAllowed.ts';
import type { Stoptime } from './Stoptime.ts';
import type { TripGeometry } from './TripGeometry.ts';
import type { TripRoute } from './TripRoute.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

/** One trip on one service date: its stops and times, realtime merged in. On a date without realtime the rows carry the schedule alone, and on a date the trip does not run they carry its schedule on that date. */
export interface TripTimetable {
  gtfsId: string;
  /** `0` or `1`, as the feed gives it; null when it gives none. */
  directionId: string | null;
  /** Null when the feed has none. */
  tripHeadsign: string | null;
  bikesAllowed: BikesAllowed;
  wheelchairAccessible: WheelchairBoarding;
  route: TripRoute;
  stoptimesForDate: Stoptime[];
  /** The trip's path; null when the feed has no shapes. */
  tripGeometry: TripGeometry | null;
}
