import type { ScooterOptimizationType } from './ScooterOptimizationType.ts';
import type { TriangleScooterFactorsInput } from './TriangleScooterFactorsInput.ts';

export interface ScooterOptimizationInput {
  triangle?: TriangleScooterFactorsInput;
  type?: ScooterOptimizationType;
}
