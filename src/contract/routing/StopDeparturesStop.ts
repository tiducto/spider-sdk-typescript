import type { Stoptime } from './Stoptime.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface StopDeparturesStop {
  gtfsId: string;
  name: string;
  wheelchairBoarding?: WheelchairBoarding;
  stoptimesWithoutPatterns?: Stoptime[];
}
