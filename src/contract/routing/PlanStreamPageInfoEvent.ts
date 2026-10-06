import type { RoutingError } from './RoutingError.ts';

/** Sent once, after the last `chunk`. To continue, send `endCursor` as `after` or `startCursor` as `before` in a new request. */
export interface PlanStreamPageInfoEvent {
  /** Send as `before` for earlier itineraries; null when there is none. */
  startCursor?: string;
  /** Send as `after` for later itineraries; null when there is none. */
  endCursor?: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  /** The window the stream searched, as an ISO-8601 duration; null for a declined plan. */
  searchWindowUsed?: string;
  /** Why the plan was declined; empty when it was not. */
  routingErrors: RoutingError[];
}
