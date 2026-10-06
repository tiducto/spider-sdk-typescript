import type { DepartureBoard } from './DepartureBoard.ts';

/** `stop` is the board, or null for an id that is neither a stop nor a station. */
export interface DeparturesResponse {
  stop?: DepartureBoard;
}
