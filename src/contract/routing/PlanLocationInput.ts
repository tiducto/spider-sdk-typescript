import type { PlanCoordinateInput } from './PlanCoordinateInput.ts';
import type { PlanStopLocationInput } from './PlanStopLocationInput.ts';

export interface PlanLocationInput {
  coordinate?: PlanCoordinateInput;
  stopLocation?: PlanStopLocationInput;
}
