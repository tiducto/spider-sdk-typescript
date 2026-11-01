import type { EstimatedDelay } from './EstimatedDelay.ts';

/** `estimatedDelays` is the history table, or null when the trip id resolves to no trip, the stop position is not on the trip, or the trip has no history at that stop on the service date's day type and no earlier trip of the pattern shifts its arrival at any level. */
export interface EstimatedDelaysResponse {
  /** Three entries, in the order `STANDARD`, `SAFE`, `VERY_SAFE`. History only: live realtime never changes them, so for a live trip they are present while `typicalDelay` is null. For a trip without live realtime they equal `trip`'s `typicalDelay` wherever that is not null, unless a live trip ahead of it in the pattern shifts that value; a level with no shift is 0. */
  estimatedDelays: EstimatedDelay[] | null;
}
