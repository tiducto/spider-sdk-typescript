import type { PlanTransitModePreferenceInput } from './PlanTransitModePreferenceInput.ts';

/** Transit modes the search may use. */
export interface PlanTransitModesInput {
  /** The modes an itinerary may ride, each with an optional reluctance. Absent means every mode. */
  transit?: PlanTransitModePreferenceInput[];
}
