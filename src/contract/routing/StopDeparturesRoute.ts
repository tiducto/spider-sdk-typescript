import type { TransitMode } from './TransitMode.ts';

export interface StopDeparturesRoute {
  shortName?: string;
  longName?: string;
  mode?: TransitMode;
}
