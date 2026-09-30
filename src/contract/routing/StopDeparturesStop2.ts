import type { StopDeparturesStoptime } from './StopDeparturesStoptime.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface StopDeparturesStop2 {
  gtfsId: string;
  name: string;
  wheelchairBoarding?: WheelchairBoarding;
  stoptimesWithoutPatterns?: StopDeparturesStoptime[];
}
