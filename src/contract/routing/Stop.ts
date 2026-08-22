import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface Stop {
  gtfsId: string;
  wheelchairBoarding?: WheelchairBoarding;
}
