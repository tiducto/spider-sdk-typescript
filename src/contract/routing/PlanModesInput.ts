import type { PlanDirectMode } from './PlanDirectMode.ts';
import type { PlanTransitModesInput } from './PlanTransitModesInput.ts';

export interface PlanModesInput {
  direct?: PlanDirectMode[];
  directOnly?: boolean;
  transit?: PlanTransitModesInput;
  transitOnly?: boolean;
}
