import type { BikesAllowed } from './BikesAllowed.ts';
import type { StopDeparturesRoute } from './StopDeparturesRoute.ts';

export interface StopDeparturesTrip {
  gtfsId: string;
  bikesAllowed?: BikesAllowed;
  route: StopDeparturesRoute;
}
