import type { TransitMode } from './TransitMode.ts';

export interface Route {
  shortName?: string;
  longName?: string;
  mode?: TransitMode;
}
