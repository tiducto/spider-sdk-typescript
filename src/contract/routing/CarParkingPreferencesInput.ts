import type { ParkingFilter } from './ParkingFilter.ts';

export interface CarParkingPreferencesInput {
  filters?: ParkingFilter[];
  preferred?: ParkingFilter[];
  unpreferredCost?: number;
}
