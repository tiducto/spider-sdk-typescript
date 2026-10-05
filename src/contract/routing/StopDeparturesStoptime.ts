import type { RealtimeState } from './RealtimeState.ts';
import type { StopDeparturesStop } from './StopDeparturesStop.ts';
import type { StopDeparturesTrip } from './StopDeparturesTrip.ts';

export interface StopDeparturesStoptime {
  serviceDay?: number;
  scheduledDeparture?: number;
  realtimeDeparture?: number;
  realtime?: boolean;
  realtimeState?: RealtimeState;
  /** Typical (p50) delay at this stop in seconds for this trip on the service date's day type; null when unknown. */
  typicalDelay?: number;
  headsign?: string;
  stop?: StopDeparturesStop;
  trip?: StopDeparturesTrip;
}
