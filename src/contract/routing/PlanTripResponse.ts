import type { Itinerary } from './Itinerary.ts';
import type { PlanPageInfo } from './PlanPageInfo.ts';
import type { RoutingError } from './RoutingError.ts';

/** One page of itineraries. An empty `itineraries` with empty `routingErrors` means the search ran and found nothing in the window. A plan the router declines has the reason in `routingErrors`; with `NO_STOPS_IN_RANGE` or `NO_TRANSIT_CONNECTION`, `itineraries` holds the direct walk when one exists, and is empty otherwise. */
export interface PlanTripResponse {
  itineraries: Itinerary[];
  pageInfo: PlanPageInfo;
  /** Why the plan was declined; empty when it was not. */
  routingErrors: RoutingError[];
  /** The date-time the search started from; with a cursor, the cursor's. */
  searchDateTime: string;
}
