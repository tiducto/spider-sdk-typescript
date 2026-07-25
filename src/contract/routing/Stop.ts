import type { Stoptime } from './Stoptime.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface Stop {
  gtfsId: string;
  name: string;
  wheelchairBoarding?: WheelchairBoarding;
  stoptimesWithoutPatterns?: Stoptime[];
}
