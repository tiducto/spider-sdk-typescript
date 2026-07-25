import type { PlanCoordinateInput } from './PlanCoordinateInput.ts';

export interface PlanVisitViaLocationInput {
  coordinate?: PlanCoordinateInput;
  label?: string;
  minimumWaitTime?: string;
  stopLocationIds?: string[];
}
