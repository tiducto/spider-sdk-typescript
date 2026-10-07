import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface Stop {
  gtfsId: string;
  wheelchairBoarding: WheelchairBoarding;
  /** Null when the feed has none. */
  platformCode: string;
  /** Null when the feed has none. */
  zoneId: string;
}
