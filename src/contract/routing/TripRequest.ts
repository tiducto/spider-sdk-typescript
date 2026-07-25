import type { TripVariables } from './TripVariables.ts';

export interface TripRequest {
  /** Persisted-query id (lowercase hex SHA-256 of the canonical query). */
  id: 'e8959a8d47a8e8437ee3ec740cd9c3e28bd401efdd236dde0502559daea53920' | (string & {});
  variables: TripVariables;
}
