import type { Itinerary } from './Itinerary.ts';

/** Progress, with the itineraries that became final since the previous `chunk`. */
export interface PlanStreamChunkEvent {
  /** Seconds of the window searched so far. */
  frontier: number;
  /** Itineraries found so far. */
  found: number;
  /** Itineraries sent so far, this chunk's included. */
  finalized: number;
  /** Itineraries that became final with this chunk. */
  results: Itinerary[];
}
