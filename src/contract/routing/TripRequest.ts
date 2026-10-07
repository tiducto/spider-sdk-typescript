/** POST body for `/routing/v1/trip`. A key not listed here is a 400 `<key> is not allowed`, whatever its value, null included. `null` on an optional member means absent, and on a required member is a 400 `<path> is required`. */
export interface TripRequest {
  /** Feed-prefixed trip id (`<feedId>:<id>`). A bare or foreign-prefixed id resolves to nothing, and `trip` is null. */
  id: string;
  /** The service date, `YYYY-MM-DD` (`YYYYMMDD` also works). Absent means today in the feed's time zone, whether or not the feed covers it. A value that is not a real date is a 400 `serviceDate is invalid`. */
  serviceDate?: string;
}
