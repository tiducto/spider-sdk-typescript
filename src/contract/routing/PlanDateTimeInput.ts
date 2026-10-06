/** Exactly one of `earliestDeparture`, `latestArrival`. Both are RFC 3339 date-times with an offset, e.g. `2026-10-07T08:00:00+02:00`. */
export interface PlanDateTimeInput {
  /** Depart at or after this time. */
  earliestDeparture?: string;
  /** Arrive at or before this time. */
  latestArrival?: string;
}
