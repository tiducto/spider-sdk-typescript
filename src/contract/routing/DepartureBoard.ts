import type { ParentStation } from './ParentStation.ts';
import type { StopDeparturesStoptime } from './StopDeparturesStoptime.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

/** Departures for one stop (a stop id) or a whole station (a station id), realtime merged in. A trip's final stop, a canceled departure and a departure that does not allow boarding give no row. */
export interface DepartureBoard {
  gtfsId: string;
  name: string;
  /** Null for a station's departures. */
  wheelchairBoarding: WheelchairBoarding | null;
  /** The station the stop belongs to, as OTP's `Stop.parentStation`; its `gtfsId` asks for the whole station's departures. Null for a station's departures and for a stop without one. */
  parentStation: ParentStation | null;
  stoptimesWithoutPatterns: StopDeparturesStoptime[];
}
