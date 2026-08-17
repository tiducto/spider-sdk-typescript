import type { CarParkingPreferencesInput } from './CarParkingPreferencesInput.ts';
import type { CarRentalPreferencesInput } from './CarRentalPreferencesInput.ts';

export interface CarPreferencesInput {
  boardCost?: number;
  parking?: CarParkingPreferencesInput;
  reluctance?: number;
  rental?: CarRentalPreferencesInput;
}
