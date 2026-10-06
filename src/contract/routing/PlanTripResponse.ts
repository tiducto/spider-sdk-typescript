import type { Itinerary } from './Itinerary.ts';
import type { PlanPageInfo } from './PlanPageInfo.ts';
import type { RoutingError } from './RoutingError.ts';

/** One page of itineraries. An empty `itineraries` with empty `routingErrors` means the search ran and found nothing in the window: page on with `after` or widen `searchWindow`. A plan the router declines has no itineraries and the reason in `routingErrors`. */
export interface PlanTripResponse {
  itineraries: Itinerary[];
  pageInfo: PlanPageInfo;
  /** Why the plan was declined; empty when it was not. */
  routingErrors: RoutingError[];
  /** The date-time the search started from. */
  searchDateTime?: string;
}
