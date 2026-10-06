import type { PlanPassThroughViaLocationInput } from './PlanPassThroughViaLocationInput.ts';
import type { PlanVisitViaLocationInput } from './PlanVisitViaLocationInput.ts';

/** Exactly one of `passThrough`, `visit`. */
export interface PlanViaLocationInput {
  /** The journey passes the location, on board or by changing vehicles there. */
  passThrough?: PlanPassThroughViaLocationInput;
  /** The journey stops at the location: it alights there and boards again after `minimumWaitTime`. */
  visit?: PlanVisitViaLocationInput;
}
