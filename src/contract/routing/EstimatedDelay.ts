import type { Reliability } from './Reliability.ts';

export interface EstimatedDelay {
  reliability: Reliability;
  /** Seconds: the level's percentile of the trip's recorded delay at this stop on the service date's day type, from the environment's realtime history; never below 0. */
  delay: number;
}
