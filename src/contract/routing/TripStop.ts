import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface TripStop {
  gtfsId: string;
  name: string;
  lat?: number;
  lon?: number;
  wheelchairBoarding?: WheelchairBoarding;
}
