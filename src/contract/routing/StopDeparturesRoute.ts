import type { TransitMode } from './TransitMode.ts';

export interface StopDeparturesRoute {
  gtfsId: string;
  /** Null when the feed has none. */
  shortName: string;
  /** Null when the feed has none. */
  longName: string;
  mode: TransitMode;
  /** Hex without `#`; null when the feed has none. */
  color: string;
  /** Hex without `#`; null when the feed has none. */
  textColor: string;
}
