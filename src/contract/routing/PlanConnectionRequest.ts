import type { PlanConnectionVariables } from './PlanConnectionVariables.ts';

export interface PlanConnectionRequest {
  /** Persisted-query id (lowercase hex SHA-256 of the canonical query). */
  id: 'f19608964d423831b485ccc878cb25eff56c720585d4423ee617c864e2b3102e' | (string & {});
  variables: PlanConnectionVariables;
}
