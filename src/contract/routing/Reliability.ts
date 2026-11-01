/** Delay level: `STANDARD`, `SAFE` and `VERY_SAFE` are the p50, p70 and p90 of the trip's recorded delay at a stop, on the service date's day type, from the environment's realtime history. Omitted means the timetable, on every operation. */
export type Reliability =
  | 'STANDARD'
  | 'SAFE'
  | 'VERY_SAFE'
  | (string & {});
