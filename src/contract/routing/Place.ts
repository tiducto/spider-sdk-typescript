import type { Stop } from './Stop.ts';

export interface Place {
  name?: string;
  /** Null when the place is not a stop, as for an origin or destination coordinate. */
  stop?: Stop;
}
