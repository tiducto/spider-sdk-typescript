import type { PlanDateTimeInput } from './PlanDateTimeInput.ts';
import type { PlanLabeledLocationInput } from './PlanLabeledLocationInput.ts';
import type { PlanModesInput } from './PlanModesInput.ts';
import type { PlanPreferencesInput } from './PlanPreferencesInput.ts';
import type { PlanViaLocationInput } from './PlanViaLocationInput.ts';

export interface PlanConnectionVariables {
  dateTime: PlanDateTimeInput;
  origin: PlanLabeledLocationInput;
  destination: PlanLabeledLocationInput;
  via?: PlanViaLocationInput[];
  modes?: PlanModesInput;
  preferences?: PlanPreferencesInput;
  searchWindow: string;
  before?: string;
  after?: string;
}
