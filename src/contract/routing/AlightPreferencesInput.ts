/** Alighting preferences. */
export interface AlightPreferencesInput {
  /** Least time needed to alight, as an ISO-8601 duration: `PT0S` to `PT1H`; rejected, never clamped. */
  slack?: string;
}
