/** POST body for `/routing/departures`. A key not listed here is a 400 `<key> is not allowed`. Every bound is rejected, never clamped. */
export interface DeparturesRequest {
  /** Feed-prefixed id (`<feedId>:<id>`) of a stop, for that platform's board, or of a station, for all its platforms. */
  id: string;
  /** Most rows on the board: 1 up to the environment's limit; rejected, never clamped. */
  numberOfDepartures: number;
  /** Unix seconds the board starts at. Absent or 0 means now. */
  startTime?: number;
  /** Seconds after `startTime` the board covers: 1 to 86400 (24 hours); rejected, never clamped. */
  timeRange: number;
}
