import type { AccessibilityPreferencesInput } from './AccessibilityPreferencesInput.ts';
import type { PlanStreetPreferencesInput } from './PlanStreetPreferencesInput.ts';
import type { TransitPreferencesInput } from './TransitPreferencesInput.ts';

export interface PlanPreferencesInput {
  accessibility?: AccessibilityPreferencesInput;
  street?: PlanStreetPreferencesInput;
  transit?: TransitPreferencesInput;
}
