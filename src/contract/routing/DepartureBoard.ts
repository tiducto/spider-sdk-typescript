import type { StopDeparturesStoptime } from './StopDeparturesStoptime.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

/** Departures board for one platform (a stop id) or a whole station (a station id), realtime merged in. A trip's final stop, a canceled departure and a departure that does not allow boarding give no row. */
export interface DepartureBoard {
  gtfsId: string;
  name: string;
  /** Null on a station board. */
  wheelchairBoarding: WheelchairBoarding | unknown;
  stoptimesWithoutPatterns: StopDeparturesStoptime[];
}
