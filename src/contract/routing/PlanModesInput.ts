import type { PlanTransitModesInput } from './PlanTransitModesInput.ts';

/** Which modes the search may use. */
export interface PlanModesInput {
  /** Only a direct walk, without transit. */
  directOnly?: boolean;
  /** Never a journey without a transit leg. */
  transitOnly?: boolean;
  transit?: PlanTransitModesInput;
}
