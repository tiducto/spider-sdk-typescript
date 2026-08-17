import type { CyclingOptimizationType } from './CyclingOptimizationType.ts';
import type { TriangleCyclingFactorsInput } from './TriangleCyclingFactorsInput.ts';

export interface CyclingOptimizationInput {
  triangle?: TriangleCyclingFactorsInput;
  type?: CyclingOptimizationType;
}
