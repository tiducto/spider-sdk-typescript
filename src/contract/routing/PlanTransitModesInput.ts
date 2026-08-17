import type { PlanAccessMode } from './PlanAccessMode.ts';
import type { PlanEgressMode } from './PlanEgressMode.ts';
import type { PlanTransferMode } from './PlanTransferMode.ts';
import type { PlanTransitModePreferenceInput } from './PlanTransitModePreferenceInput.ts';

export interface PlanTransitModesInput {
  access?: PlanAccessMode[];
  egress?: PlanEgressMode[];
  transfer?: PlanTransferMode[];
  transit?: PlanTransitModePreferenceInput[];
}
