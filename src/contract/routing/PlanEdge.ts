import type { Itinerary } from './Itinerary.ts';

export interface PlanEdge {
  cursor: string;
  node: Itinerary;
}
