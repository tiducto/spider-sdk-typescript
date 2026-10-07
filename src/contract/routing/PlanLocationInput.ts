import type { PlanCoordinateInput } from './PlanCoordinateInput.ts';
import type { PlanStopLocationInput } from './PlanStopLocationInput.ts';

/** Exactly one of `coordinate`, `stopLocation`; neither or both is a 400 naming `origin.location` or `destination.location`. */
export interface PlanLocationInput {
  /** A point; the journey walks between it and the stops. */
  coordinate?: PlanCoordinateInput | unknown;
  /** A stop or a station. */
  stopLocation?: PlanStopLocationInput | unknown;
}
