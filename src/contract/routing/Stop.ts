import type { ParentStation } from './ParentStation.ts';
import type { WheelchairBoarding } from './WheelchairBoarding.ts';

export interface Stop {
  gtfsId: string;
  wheelchairBoarding: WheelchairBoarding;
  /** Null when the feed has none. */
  platformCode: string | null;
  /** Null when the feed has none. */
  zoneId: string | null;
  /** The station this stop belongs to, as OTP's `Stop.parentStation`; null when the stop has none. */
  parentStation: ParentStation | null;
}
