import type { TransitMode } from './TransitMode.ts';

/** The reluctance of one transit mode, a Spider extension. */
export interface TransitModeCostInput {
  mode: TransitMode;
  /** Multiplier on the time spent riding this mode, from 0.1 to 100000: above 1 avoids the mode, below 1 favours it; rejected, never clamped. */
  reluctance: number;
}
