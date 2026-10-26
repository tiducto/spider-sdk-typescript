import type { Itinerary } from './Itinerary.ts';
import type { PlanPageInfo } from './PlanPageInfo.ts';
import type { RoutingError } from './RoutingError.ts';

/** One page of itineraries. A search that ran and kept no transit itinerary in the window says why in `routingErrors`: `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW`, or `WALKING_BETTER_THAN_TRANSIT` when walking beat every transit itinerary found. A plan the router declines has the reason in `routingErrors`; with `NO_STOPS_IN_RANGE` or `NO_TRANSIT_CONNECTION`, `itineraries` holds the direct walk when one exists, and is empty otherwise. */
export interface PlanTripResponse {
  itineraries: Itinerary[];
  pageInfo: PlanPageInfo;
  /** Why the plan was declined or kept no transit itinerary in the window; empty otherwise. */
  routingErrors: RoutingError[];
  /** The date-time the search started from; with a cursor, the cursor's. */
  searchDateTime: string;
}
