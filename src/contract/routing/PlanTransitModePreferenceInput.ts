import type { TransitMode } from './TransitMode.ts';
import type { TransitModePreferenceCostInput } from './TransitModePreferenceCostInput.ts';

/** A transit mode the search may use. */
export interface PlanTransitModePreferenceInput {
  mode: TransitMode;
  cost?: TransitModePreferenceCostInput;
}
