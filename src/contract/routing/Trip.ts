import type { BikesAllowed } from './BikesAllowed.ts';

export interface Trip {
  gtfsId: string;
  bikesAllowed?: BikesAllowed;
}
