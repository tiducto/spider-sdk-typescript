import type { RealtimeState } from './RealtimeState.ts';
import type { TripStop } from './TripStop.ts';

export interface TripStoptime {
  serviceDay?: number;
  scheduledArrival?: number;
  scheduledDeparture?: number;
  realtimeArrival?: number;
  realtimeDeparture?: number;
  realtime?: boolean;
  realtimeState?: RealtimeState;
  stop?: TripStop;
}
