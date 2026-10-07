/** Walking preferences. */
export interface WalkPreferencesInput {
  /** Walking speed on flat ground in metres per second, at least 0.1 (0.1 included); rejected, never clamped. */
  speed?: number;
  /** How much worse walking is than riding for the same time, a multiplier from 0.1 to 100000; rejected, never clamped. */
  reluctance?: number;
  /** Generalized cost added for each boarding, an integer from 0 to 1000000; rejected, never clamped. */
  boardCost?: number;
}
