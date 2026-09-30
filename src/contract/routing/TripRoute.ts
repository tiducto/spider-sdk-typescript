import type { TransitMode } from './TransitMode.ts';

export interface TripRoute {
  gtfsId: string;
  shortName?: string;
  longName?: string;
  mode?: TransitMode;
  color?: string;
  textColor?: string;
}
