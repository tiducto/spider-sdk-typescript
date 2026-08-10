import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface PlanConnectionStop {
  gtfsId: string;
  wheelchairBoarding?: WheelchairBoarding;
}
