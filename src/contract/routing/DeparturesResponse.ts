import type { DepartureBoard } from './DepartureBoard.ts';

/** `stop` is the board, or null for an id that resolves to no stop or station. */
export interface DeparturesResponse {
  stop: DepartureBoard | unknown;
}
