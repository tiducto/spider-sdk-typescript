import type { BikesAllowed } from './BikesAllowed.ts';
import type { StopDeparturesRoute } from './StopDeparturesRoute.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface StopDeparturesTrip {
  gtfsId: string;
  bikesAllowed: BikesAllowed;
  wheelchairAccessible: WheelchairBoarding;
  route: StopDeparturesRoute;
}
