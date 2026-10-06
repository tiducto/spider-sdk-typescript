import type { TransitMode } from './TransitMode.ts';

export interface StopDeparturesRoute {
  gtfsId: string;
  shortName?: string;
  longName?: string;
  mode?: TransitMode;
  /** Hex without `#`; null when the feed has none. */
  color?: string;
  /** Hex without `#`; null when the feed has none. */
  textColor?: string;
}
