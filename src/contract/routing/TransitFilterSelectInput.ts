/** Exactly one of `routes`, `agencies`. */
export interface TransitFilterSelectInput {
  /** Feed-prefixed route ids (`<feedId>:<routeId>`). */
  routes?: string[];
  /** Feed-prefixed agency ids (`<feedId>:<agencyId>`). */
  agencies?: string[];
}
