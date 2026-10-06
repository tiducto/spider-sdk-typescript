/** POST body for `/routing/trip`. A key not listed here is a 400 `<key> is not allowed`. */
export interface TripRequest {
  /** Feed-prefixed trip id (`<feedId>:<id>`). */
  id: string;
  /** The service date, `YYYY-MM-DD` (`YYYYMMDD` also works). Absent means today in the feed's time zone. A value that is not a real date is a 400 naming `serviceDate`. */
  serviceDate?: string;
}
