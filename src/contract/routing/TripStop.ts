import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface TripStop {
  gtfsId: string;
  name: string;
  lat: number;
  lon: number;
  wheelchairBoarding: WheelchairBoarding;
  /** Null when the feed has none. */
  platformCode: string | null;
  /** Null when the feed has none. */
  zoneId: string | null;
}
