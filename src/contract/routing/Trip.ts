import type { BikesAllowed } from './BikesAllowed.ts';
import type { Route } from './Route.ts';

export interface Trip {
  gtfsId: string;
  bikesAllowed?: BikesAllowed;
  route: Route;
}
