import type { PlanCoordinateInput } from './PlanCoordinateInput.ts';
import type { PlanStopLocationInput } from './PlanStopLocationInput.ts';

/** Exactly one of `coordinate`, `stopLocation`. */
export interface PlanLocationInput {
  /** A point; the journey walks between it and the stops. */
  coordinate?: PlanCoordinateInput;
  /** A stop or a station. */
  stopLocation?: PlanStopLocationInput;
}
