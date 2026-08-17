import type { TransitMode } from './TransitMode.ts';

export interface TripRoute {
  shortName?: string;
  longName?: string;
  mode?: TransitMode;
}
