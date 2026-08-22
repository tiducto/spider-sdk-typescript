import type { BicycleParkingPreferencesInput } from './BicycleParkingPreferencesInput.ts';
import type { BicycleRentalPreferencesInput } from './BicycleRentalPreferencesInput.ts';
import type { BicycleWalkPreferencesInput } from './BicycleWalkPreferencesInput.ts';
import type { CyclingOptimizationInput } from './CyclingOptimizationInput.ts';

export interface BicyclePreferencesInput {
  boardCost?: number;
  optimization?: CyclingOptimizationInput;
  parking?: BicycleParkingPreferencesInput;
  reluctance?: number;
  rental?: BicycleRentalPreferencesInput;
  speed?: number;
  walk?: BicycleWalkPreferencesInput;
}
