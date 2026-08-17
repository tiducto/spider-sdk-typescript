import type { ParkingFilter } from './ParkingFilter.ts';

export interface BicycleParkingPreferencesInput {
  filters?: ParkingFilter[];
  preferred?: ParkingFilter[];
  unpreferredCost?: number;
}
