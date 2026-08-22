import type { BicyclePreferencesInput } from './BicyclePreferencesInput.ts';
import type { CarPreferencesInput } from './CarPreferencesInput.ts';
import type { ScooterPreferencesInput } from './ScooterPreferencesInput.ts';
import type { WalkPreferencesInput } from './WalkPreferencesInput.ts';

export interface PlanStreetPreferencesInput {
  bicycle?: BicyclePreferencesInput;
  car?: CarPreferencesInput;
  scooter?: ScooterPreferencesInput;
  walk?: WalkPreferencesInput;
}
