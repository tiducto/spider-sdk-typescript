import type { GraphQLError } from './GraphQLError.ts';
import type { PlanConnectionData } from './PlanConnectionData.ts';

export interface PlanConnectionResponse {
  data?: PlanConnectionData;
  errors?: GraphQLError[];
}
