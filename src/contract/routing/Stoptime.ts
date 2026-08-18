import type { RealtimeState } from './RealtimeState.ts';
import type { Trip } from './Trip.ts';

export interface Stoptime {
  serviceDay?: number;
  scheduledDeparture?: number;
  realtimeDeparture?: number;
  realtime?: boolean;
  realtimeState?: RealtimeState;
  headsign?: string;
  trip?: Trip;
}
