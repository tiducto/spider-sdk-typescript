import type { PlanConnectionVariables } from './PlanConnectionVariables.ts';

export interface PlanConnectionRequest {
  /** Persisted-query id (lowercase hex SHA-256 of the canonical query). */
  id: 'a0cc636086f0cb10bea736a4977961afaa245a26cb3f8d23352a74c1f6ba9857' | (string & {});
  variables: PlanConnectionVariables;
}
