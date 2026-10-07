import type { AccessibilityPreferencesInput } from './AccessibilityPreferencesInput.ts';
import type { PlanStreetPreferencesInput } from './PlanStreetPreferencesInput.ts';
import type { TransitPreferencesInput } from './TransitPreferencesInput.ts';

/** Routing preferences. An absent member keeps the environment's default. */
export interface PlanPreferencesInput {
  street?: PlanStreetPreferencesInput | unknown;
  transit?: TransitPreferencesInput | unknown;
  accessibility?: AccessibilityPreferencesInput | unknown;
}
