import type { PlanPassThroughViaLocationInput } from './PlanPassThroughViaLocationInput.ts';
import type { PlanVisitViaLocationInput } from './PlanVisitViaLocationInput.ts';

export interface PlanViaLocationInput {
  passThrough?: PlanPassThroughViaLocationInput;
  visit?: PlanVisitViaLocationInput;
}
