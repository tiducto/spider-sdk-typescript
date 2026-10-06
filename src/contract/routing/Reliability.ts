/** Planning level: `STANDARD` plans arrivals with the p50 delay, `SAFE` p70, `VERY_SAFE` p90; omitted plans on the timetable. Each leg's arrival is planned with that trip's typical delay at the stop on the service date's day type, from the environment's realtime history. Boarding keeps the scheduled departure, and a trip with live realtime uses its realtime times. */
export type Reliability =
  | 'STANDARD'
  | 'SAFE'
  | 'VERY_SAFE'
  | (string & {});
