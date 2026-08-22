import type { PlanLocationInput } from './PlanLocationInput.ts';

export interface PlanLabeledLocationInput {
  label?: string;
  location: PlanLocationInput;
}
