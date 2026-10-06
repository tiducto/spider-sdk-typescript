/** Boarding preferences. */
export interface BoardPreferencesInput {
  /** How much worse waiting at a stop is than riding for the same time, a multiplier from 0.1 to 100000; rejected, never clamped. */
  waitReluctance?: number;
  /** Least time at the stop before boarding, as an ISO-8601 duration: `PT0S` to `PT1H`; rejected, never clamped. */
  slack?: string;
}
