import type { PlanLocationInput } from './PlanLocationInput.ts';

/** An origin or destination. */
export interface PlanLabeledLocationInput {
  location: PlanLocationInput;
}
