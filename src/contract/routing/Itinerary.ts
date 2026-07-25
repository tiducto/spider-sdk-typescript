import type { Leg } from './Leg.ts';

export interface Itinerary {
  start?: string;
  end?: string;
  duration?: number;
  waitingTime?: number;
  numberOfTransfers: number;
  accessibilityScore?: number;
  legs: Leg[];
}
