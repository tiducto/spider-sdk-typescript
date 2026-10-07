import type { WalkPreferencesInput } from './WalkPreferencesInput.ts';

/** Street preferences, for walking to, from and between stops. */
export interface PlanStreetPreferencesInput {
  walk?: WalkPreferencesInput | unknown;
}
