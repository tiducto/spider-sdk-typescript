import type { PlanDateTimeInput } from './PlanDateTimeInput.ts';
import type { PlanLabeledLocationInput } from './PlanLabeledLocationInput.ts';
import type { PlanViaLocationInput } from './PlanViaLocationInput.ts';

export interface PlanConnectionVariables {
  dateTime: PlanDateTimeInput;
  origin: PlanLabeledLocationInput;
  destination: PlanLabeledLocationInput;
  via?: PlanViaLocationInput[];
  first?: number;
  before?: string;
  after?: string;
}
