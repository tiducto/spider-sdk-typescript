import type { RealtimeState } from './RealtimeState.ts';
import type { StopDeparturesTrip } from './StopDeparturesTrip.ts';

export interface Stoptime {
  serviceDay?: number;
  scheduledDeparture?: number;
  realtimeDeparture?: number;
  realtime?: boolean;
  realtimeState?: RealtimeState;
  headsign?: string;
  trip?: StopDeparturesTrip;
}
