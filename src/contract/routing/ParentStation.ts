/** The station a stop belongs to (GTFS `parent_station`, a `location_type` 1 stop). Its `gtfsId` is a station id that plan's `stopLocationId` and departures' `id` accept. */
export interface ParentStation {
  gtfsId: string;
  name: string;
}
