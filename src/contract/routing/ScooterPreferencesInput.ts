import type { ScooterOptimizationInput } from './ScooterOptimizationInput.ts';
import type { ScooterRentalPreferencesInput } from './ScooterRentalPreferencesInput.ts';

export interface ScooterPreferencesInput {
  optimization?: ScooterOptimizationInput;
  reluctance?: number;
  rental?: ScooterRentalPreferencesInput;
  speed?: number;
}
