import type { PlanTransitModesInput } from './PlanTransitModesInput.ts';

/** Which modes the search may use. `directOnly` and `transitOnly` together are a 400 `modes is invalid`. */
export interface PlanModesInput {
  /** Only a direct walk, without transit. A direct-only plan has no pages: its cursors are null. */
  directOnly?: boolean;
  /** Never a journey without a transit leg. */
  transitOnly?: boolean;
  transit?: PlanTransitModesInput | unknown;
}
