import type { PlanPassThroughViaLocationInput } from './PlanPassThroughViaLocationInput.ts';
import type { PlanVisitViaLocationInput } from './PlanVisitViaLocationInput.ts';

/** Exactly one of `passThrough`, `visit`; neither or both is a 400 `via is invalid`. */
export interface PlanViaLocationInput {
  /** The journey passes the location: on board, alighting there, or starting there. A stop where the vehicle does not let passengers off is not passed on board, and walking there to board is not a pass. */
  passThrough?: PlanPassThroughViaLocationInput;
  /** The journey stops at the location: it alights there and boards again after `minimumWaitTime`. */
  visit?: PlanVisitViaLocationInput;
}
