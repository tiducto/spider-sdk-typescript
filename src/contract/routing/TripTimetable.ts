import type { BikesAllowed } from './BikesAllowed.ts';
import type { Stoptime } from './Stoptime.ts';
import type { TripGeometry } from './TripGeometry.ts';
import type { TripRoute } from './TripRoute.ts';
import type { TripVehicle } from './TripVehicle.ts';
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
  /** The vehicle running the trip run answered (the requested `serviceDate`, and `startTime` for a frequency-based trip), as the realtime trip update names it. A Spider extension: OTP 2.10 has no vehicle on a trip. Null until a vehicle is matched to the run. Its `wheelchairAccessible` is the vehicle's realtime access, separate from this trip's `wheelchairAccessible`, which stays the timetable's. */
  vehicle: TripVehicle | null;
}
