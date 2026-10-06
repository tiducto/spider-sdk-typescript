/** A location the journey stops at. */
export interface PlanVisitViaLocationInput {
  /** 1 to 10 feed-prefixed stop or station ids; visiting any one of them is enough. Absent, empty, or more than 10 is a 400 naming `via`. */
  stopLocationIds?: string[];
  /** Least time to stay at the location, as an ISO-8601 duration: `PT0S` to `PT1H`; rejected, never clamped. Absent means `PT0S`. */
  minimumWaitTime?: string;
}
