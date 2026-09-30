import type { RealtimeState } from './RealtimeState.ts';
import type { StopDeparturesStop } from './StopDeparturesStop.ts';
import type { StopDeparturesTrip } from './StopDeparturesTrip.ts';

export interface StopDeparturesStoptime {
  serviceDay?: number;
  scheduledDeparture?: number;
  realtimeDeparture?: number;
  realtime?: boolean;
  realtimeState?: RealtimeState;
  headsign?: string;
  stop?: StopDeparturesStop;
  trip?: StopDeparturesTrip;
}
