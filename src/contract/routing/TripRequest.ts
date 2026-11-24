import type { Reliability } from './Reliability.ts';

/** POST body for `/routing/v1/trip`. A key not listed here is a 400 `<key> is not allowed`, whatever its value, null included. `null` on an optional member means absent, and on a required member is a 400 `<path> is required`. */
export interface TripRequest {
  /** Feed-prefixed trip id (`<feedId>:<id>`). A bare or foreign-prefixed id resolves to nothing, and `trip` is null. */
  id: string;
  /** The trip's GTFS service date, `YYYY-MM-DD` (`YYYYMMDD` also works). Absent or null is a 400 `serviceDate is required`, and a value that is not a real date a 400 `serviceDate is invalid`. */
  serviceDate: string;
  /** The run of a frequency-based trip (`frequencies.txt`) to answer, by its start time: a GTFS time `H:MM:SS` or `HH:MM:SS` (hours up to 99), compared as a time (`8:10:00` is `08:10:00`), the same value as the GTFS-RT `start_time` and the realtime API's `startTime`. A trip without frequencies has one run, starting at its first scheduled departure. Omitted or null, the trip's first run on `serviceDate` is answered. A value no run of the trip starts at is answered as an unknown trip: `trip` is null. Any other value not of that form is a 400 `startTime is invalid`. */
  startTime?: string;
  /** The level `typicalDelay` is given at; the times do not depend on it. Omitted or null, `typicalDelay` is null. A value outside `Reliability` is a 400 `reliability is invalid`. */
  reliability?: Reliability;
}
