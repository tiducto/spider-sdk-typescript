import type { RoutingError } from './RoutingError.ts';

/** Sent once, after the last `chunk`. To continue, send `endCursor` as `after` or `startCursor` as `before` in a new request. */
export interface PlanStreamPageInfoEvent {
  /** Send as `before` for earlier itineraries; null when there is none, as for a declined, direct-only or unroutable plan. */
  startCursor: string;
  /** Send as `after` for later itineraries; null when there is none, as for a declined, direct-only or unroutable plan. */
  endCursor: string;
  /** True exactly when `endCursor` is present. */
  hasNextPage: boolean;
  /** True exactly when `startCursor` is present. */
  hasPreviousPage: boolean;
  /** The window the stream searched, as an ISO-8601 duration; null when no transit search ran, as for a declined, direct-only or unroutable plan. */
  searchWindowUsed: string;
  /** Why the plan was declined; empty when it was not. */
  routingErrors: RoutingError[];
}
