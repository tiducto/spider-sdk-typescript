import type { Stop } from './Stop.ts';

export interface Place {
  /** The stop's name; `Origin` or `Destination` for a coordinate. */
  name: string;
  /** The position in the leg's trip of this stop time, as the trip's `stopPosition`. Null unless the leg is a ride. */
  stopPosition: number | null;
  /** Null when the place is not a stop, as for an origin or destination coordinate. */
  stop: Stop | null;
}
