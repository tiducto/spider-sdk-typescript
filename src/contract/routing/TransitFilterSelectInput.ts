/** Exactly one of `routes`, `agencies`; neither or both is a 400 naming `preferences.transit.filters.exclude`. */
export interface TransitFilterSelectInput {
  /** Feed-prefixed route ids (`<feedId>:<routeId>`). */
  routes?: string[];
  /** Feed-prefixed agency ids (`<feedId>:<agencyId>`). */
  agencies?: string[];
}
