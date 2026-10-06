import type { Leg } from './Leg.ts';

/** One journey, leg by leg. Times are in the feed's time zone. */
export interface Itinerary {
  start?: string;
  end?: string;
  /** Seconds from `start` to `end`. */
  duration?: number;
  /** Seconds spent waiting at stops. */
  waitingTime?: number;
  /** Changes between vehicles. Staying on board as the vehicle carries on as another trip (`interlineWithPreviousLeg`) is not counted. */
  numberOfTransfers: number;
  legs: Leg[];
}
