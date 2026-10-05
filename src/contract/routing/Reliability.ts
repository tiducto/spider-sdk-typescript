/** Planning level: `STANDARD` plans arrivals with the p50 delay, `SAFE` p70, `VERY_SAFE` p90; omitted plans on the timetable. */
export type Reliability =
  | 'STANDARD'
  | 'SAFE'
  | 'VERY_SAFE'
  | (string & {});
