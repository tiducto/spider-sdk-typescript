import type { GraphQLError } from './GraphQLError.ts';
import type { PlanConnectionStreamData } from './PlanConnectionStreamData.ts';

export interface PlanConnectionStreamResponse {
  data?: PlanConnectionStreamData;
  errors?: GraphQLError[];
}
