import type { DepartureBoard } from './DepartureBoard.ts';

/** `stop` holds the departures, or is null for an id that resolves to no stop or station. */
export interface DeparturesResponse {
  stop: DepartureBoard | null;
}
