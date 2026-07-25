import type { BikesAllowed } from './BikesAllowed.ts';

export interface PlanConnectionTrip {
  gtfsId: string;
  bikesAllowed?: BikesAllowed;
}
