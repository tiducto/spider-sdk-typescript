import type { ParkingFilterOperation } from './ParkingFilterOperation.ts';

export interface ParkingFilter {
  not?: ParkingFilterOperation[];
  select?: ParkingFilterOperation[];
}
