import type { TransitMode } from './TransitMode.ts';
import type { TransitModePreferenceCostInput } from './TransitModePreferenceCostInput.ts';

export interface PlanTransitModePreferenceInput {
  cost?: TransitModePreferenceCostInput;
  mode: TransitMode;
}
